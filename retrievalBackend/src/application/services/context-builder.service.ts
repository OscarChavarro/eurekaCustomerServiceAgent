export interface RetrievedChunk {
  text: string;
  score: number;
  messages: Array<{
    role: 'agent' | 'customer';
    text: string;
  }>;
}

export interface ContextBuilder {
  buildContext(query: string, retrievedChunks: RetrievedChunk[]): string;
}

export interface ContextBuildArtifacts {
  facts: string[];
  context: string;
}

type FactCategory = 'pricing' | 'shipping' | 'general';

const MIN_USEFUL_TEXT_LENGTH = 80;
const MIN_FACT_LENGTH = 18;
const MAX_FACT_LENGTH = 220;
const MAX_FACTS = 12;
const DEFAULT_CATEGORY_PRIORITY: FactCategory[] = ['pricing', 'shipping', 'general'];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateFact(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function normalizeDedupKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9€]+/g, ' ')
    .trim();
}

function chunkSearchText(chunk: RetrievedChunk): string {
  const agentText = extractAgentMessages(chunk)
    .map((message) => normalizeWhitespace(message))
    .join(' ')
    .trim();

  return agentText.length > 0 ? agentText : normalizeWhitespace(chunk.text);
}

export function isUsefulChunk(chunk: RetrievedChunk): boolean {
  const text = chunkSearchText(chunk).toLowerCase();

  if (text.length < MIN_USEFUL_TEXT_LENGTH) return false;
  if (text.includes('hola') && text.includes('interesa un cuadro')) return false;
  if (!text.includes('€') && !text.includes('envío') && !text.includes('precio')) return false;

  return true;
}

export function extractAgentMessages(chunk: RetrievedChunk): string[] {
  return chunk.messages
    .filter((message) => message.role === 'agent')
    .map((message) => message.text);
}

export function cleanAgentText(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/\b(cliente|agente)\s*:\s*/gi, ' ')
      .replace(/\b(hola|buenas(?:\s+dias|\s+tardes|\s+noches)?|gracias)\b[\s,!.;:]*/gi, ' ')
      .replace(/\b(quedo|quedamos)\s+atent[oa]s?\b[\s,!.;:]*/gi, ' ')
      .replace(/\bseg[uú]n\s+(nuestros|los)\s+(registros?|datos)\b[\s,!.;:]*/gi, ' ')
      .replace(/\bde\s+acuerdo\s+con\s+(nuestros|los)\s+(registros?|datos)\b[\s,!.;:]*/gi, ' ')
      .replace(/\bpor\s+favor\b/gi, ' ')
  );
}

export function normalizeFact(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/euros?/gi, '€')
      .replace(/aprox\.?/gi, 'aproximadamente')
      .replace(/\s*([,.;:])\s*/g, '$1 ')
  );
}

export function categorize(text: string): FactCategory {
  const normalizedText = text.toLowerCase();

  if (/precio|coste|costo|tarifa|€|pvp|presupuesto/.test(normalizedText)) return 'pricing';
  if (/env[ií]o|entrega|plazo|recogida/.test(normalizedText)) return 'shipping';
  return 'general';
}

function filterUsefulChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  return chunks.filter((chunk) => isUsefulChunk(chunk));
}

function extractCandidateFacts(chunks: RetrievedChunk[]): string[] {
  return chunks.flatMap((chunk) => {
    const agentMessages = extractAgentMessages(chunk)
      .map((text) => cleanAgentText(text))
      .filter((text) => text.length >= MIN_FACT_LENGTH);

    if (agentMessages.length > 0) {
      return agentMessages;
    }

    const fallback = cleanAgentText(chunk.text);
    return fallback.length >= MIN_FACT_LENGTH ? [fallback] : [];
  });
}

function deduplicateFacts(facts: string[]): string[] {
  const uniqueFacts: string[] = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    const key = normalizeDedupKey(fact);
    if (key.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueFacts.push(fact);
  }

  return uniqueFacts;
}

function resolveCategoryPriority(query: string): FactCategory[] {
  const queryCategory = categorize(query);
  return [
    queryCategory,
    ...DEFAULT_CATEGORY_PRIORITY.filter((category) => category !== queryCategory)
  ];
}

function synthesizeFacts(facts: string[], query: string): string[] {
  const groupedFacts: Record<FactCategory, string[]> = {
    pricing: [],
    shipping: [],
    general: []
  };

  for (const fact of facts) {
    const normalizedFact = normalizeFact(fact);
    if (normalizedFact.length < MIN_FACT_LENGTH) {
      continue;
    }

    const category = categorize(normalizedFact);
    groupedFacts[category].push(truncateFact(normalizedFact, MAX_FACT_LENGTH));
  }

  const orderedFacts = resolveCategoryPriority(query).flatMap((category) => groupedFacts[category]);
  return orderedFacts.slice(0, MAX_FACTS);
}

export function buildContextString(facts: string[]): string {
  return [
    'Hechos de negocio relevantes para responder al usuario:',
    '',
    ...facts.map((fact) => `- ${fact}`)
  ].join('\n');
}

export function buildContextArtifacts(
  query: string,
  retrievedChunks: RetrievedChunk[]
): ContextBuildArtifacts {
  const usefulChunks = filterUsefulChunks(retrievedChunks);
  const extractedFacts = extractCandidateFacts(usefulChunks);
  const deduplicatedFacts = deduplicateFacts(extractedFacts);
  const synthesizedFacts = synthesizeFacts(deduplicatedFacts, query);

  const factsWithFallback =
    synthesizedFacts.length > 0
      ? synthesizedFacts
      : ['No hay hechos suficientes para responder con certeza.'];

  return {
    facts: factsWithFallback,
    context: buildContextString(factsWithFallback)
  };
}

export class HeuristicContextBuilderService implements ContextBuilder {
  public buildContext(query: string, retrievedChunks: RetrievedChunk[]): string {
    return buildContextArtifacts(query, retrievedChunks).context;
  }
}
