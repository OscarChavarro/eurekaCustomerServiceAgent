export type ContextGeneratorMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type GenerateContextInput = {
  messages: ContextGeneratorMessage[];
};

export interface ContextGenerator {
  generateContext(input: GenerateContextInput): Promise<string>;
}
