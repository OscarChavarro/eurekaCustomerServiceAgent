import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ConversationMessageEvidence,
  LlmStageClassificationResult,
  SemanticProbeMatch
} from '../../../domain/conversation-stage/conversation-stage-inference.types';
import type {
  GetConversationStageCommand,
  GetConversationStageDebugResult,
  GetConversationStageResult
} from './get-conversation-stage.types';
import {
  ContactClassificationType,
  ConversationInconsistencyType,
  CustomerStage,
  type ConversationInconsistency,
  type ConversationStage,
  type PreviousConversationStage,
  type StageClassificationSource
} from '../../../domain/conversation-stage/conversation-stage.types';
import type { ConversationStageInferenceConfigPort } from '../../../ports/outbound/conversation-stage-inference-config.port';
import type { ContactsPort } from '../../../ports/outbound/contacts.port';
import type { ConversationStageRepositoryPort } from '../../../ports/outbound/conversation-stage-repository.port';
import type { EmbeddingPort } from '../../../ports/outbound/embedding.port';
import type {
  LlmConversationClassificationCommand,
  LlmConversationStageClassifierPort
} from '../../../ports/outbound/llm-conversation-stage-classifier.port';
import type { QdrantConversationSearchPort } from '../../../ports/outbound/qdrant-conversation-search.port';
import { TOKENS } from '../../../ports/tokens';

type ComputeStageOutput = {
  stage: ConversationStage;
  debug: {
    refreshed: boolean;
    cacheExpired: boolean;
    messagesCount: number;
    messagesSample: ConversationMessageEvidence[];
    deterministicSignals: string[];
    semanticMatches: SemanticProbeMatch[];
    llmClassification: LlmStageClassificationResult | null;
  };
};

@Injectable()
export class GetConversationStageUseCase {
  private readonly logger = new Logger(GetConversationStageUseCase.name);

  constructor(
    @Inject(TOKENS.ConversationStageRepositoryPort)
    private readonly conversationStageRepository: ConversationStageRepositoryPort,
    @Inject(TOKENS.ContactsPort)
    private readonly contactsPort: ContactsPort,
    @Inject(TOKENS.EmbeddingPort)
    private readonly embeddingPort: EmbeddingPort,
    @Inject(TOKENS.QdrantConversationSearchPort)
    private readonly qdrantConversationSearchPort: QdrantConversationSearchPort,
    @Inject(TOKENS.LlmConversationStageClassifierPort)
    private readonly llmConversationStageClassifierPort: LlmConversationStageClassifierPort,
    @Inject(TOKENS.ConversationStageInferenceConfigPort)
    private readonly conversationStageInferenceConfigPort: ConversationStageInferenceConfigPort
  ) {}

  public async execute(command: GetConversationStageCommand): Promise<GetConversationStageResult> {
    const computed = await this.computeStage(command);
    return computed.stage;
  }

  public async executeDebug(command: GetConversationStageCommand): Promise<GetConversationStageDebugResult> {
    const computed = await this.computeStage(command);

    return {
      stage: computed.stage,
      debug: computed.debug
    };
  }

  private async computeStage(command: GetConversationStageCommand): Promise<ComputeStageOutput> {
    const existingStage = await this.conversationStageRepository.findByConversationId(command.conversationId);
    const cacheExpired = existingStage ? this.isCacheExpired(existingStage.lastStageUpdate) : true;
    const shouldRefresh = command.forceRefresh || !existingStage || cacheExpired;

    if (!shouldRefresh && existingStage) {
      return {
        stage: existingStage,
        debug: {
          refreshed: false,
          cacheExpired,
          messagesCount: 0,
          messagesSample: [],
          deterministicSignals: existingStage.detectedSignals,
          semanticMatches: [],
          llmClassification: null
        }
      };
    }

    const messages = await this.safeListConversationMessages(command.conversationId);
    const deterministicSignals = this.detectDeterministicSignals(messages);
    const classificationSource = await this.resolveClassificationSource(command.conversationId);
    const semanticMatches = await this.safeRunSemanticProbes(command.conversationId);
    const llmClassification = await this.safeClassifyWithLlm(
      command.conversationId,
      messages,
      deterministicSignals,
      semanticMatches
    );

    const currentStage = this.resolveCurrentStage(deterministicSignals, semanticMatches, llmClassification);
    const previousStages = this.buildMessageTimeline(messages, currentStage, existingStage);
    const detectedSignals = this.buildDetectedSignals(deterministicSignals, semanticMatches, llmClassification);
    const inconsistencies = this.buildInconsistencies(currentStage, classificationSource);
    const refreshedStage: ConversationStage = {
      conversationId: command.conversationId,
      currentStage,
      previousStages,
      lastStageUpdate: new Date().toISOString(),
      summary: this.resolveSummary(llmClassification),
      detectedSignals,
      classificationSource,
      inconsistencies
    };

    await this.conversationStageRepository.upsert(refreshedStage);

    return {
      stage: refreshedStage,
      debug: {
        refreshed: true,
        cacheExpired,
        messagesCount: messages.length,
        messagesSample: messages.slice(-15),
        deterministicSignals,
        semanticMatches,
        llmClassification
      }
    };
  }

  private async safeListConversationMessages(conversationId: string): Promise<ConversationMessageEvidence[]> {
    try {
      return await this.qdrantConversationSearchPort.listConversationMessages(
        conversationId,
        this.conversationStageInferenceConfigPort.getConfig().maxMessagesPerConversation
      );
    } catch (error) {
      this.logger.warn(`Qdrant message listing failed for conversation ${conversationId}. ${String(error)}`);
      return [];
    }
  }

  private detectDeterministicSignals(messages: ConversationMessageEvidence[]): string[] {
    const signals = new Set<string>();

    for (const message of messages) {
      this.detectSignalsFromText(message.text).forEach((signal) => {
        signals.add(signal);
      });
    }

    return Array.from(signals);
  }

  private detectSignalsFromText(textRaw: string): string[] {
    const text = textRaw.toLowerCase();
    const signals = new Set<string>();

    if (this.containsAny(text, ['transferencia', 'bizum', 'payment', 'paid', 'pagado'])) {
      signals.add('payment_intent');
    }
    if (this.containsAny(text, ['confirmo pedido', 'confirm order', 'order confirmed', 'quiero comprar'])) {
      signals.add('order_confirmation');
    }
    if (this.containsAny(text, ['enviado', 'tracking', 'shipment', 'shipping'])) {
      signals.add('shipping_signal');
    }
    if (this.containsAny(text, ['recibido', 'delivered', 'llego bien', 'ha llegado'])) {
      signals.add('delivery_signal');
    }
    if (this.containsAny(text, ['feedback', 'reseña', 'review', 'me encanto', 'me gustó'])) {
      signals.add('post_delivery_feedback');
    }
    if (this.containsAny(text, ['problema', 'defect', 'broken', 'garantia', 'warranty', 'refund'])) {
      signals.add('support_issue');
    }
    if (this.containsAny(text, ['te ofrezco', 'vendo servicio', 'marketing package', 'seo service', 'lead generation'])) {
      signals.add('unsolicited_seller');
    }
    if (this.containsAny(text, ['réplica', 'replica', 'fake', 'falsificado', 'copiamos tu marca', 'logo igual'])) {
      signals.add('brand_counterfeit');
    }

    return Array.from(signals);
  }

  private async resolveClassificationSource(conversationId: string): Promise<StageClassificationSource> {
    const externalId = this.resolveProspectExternalId(conversationId);
    if (externalId) {
      return {
        contactType: ContactClassificationType.PROSPECT,
        externalId
      };
    }

    const salesExternalId = this.resolveSalesExternalId(conversationId);
    if (salesExternalId) {
      return {
        contactType: ContactClassificationType.CUSTOMER,
        externalId: salesExternalId
      };
    }

    const normalizedConversationPhone = this.normalizePhone(conversationId);
    if (normalizedConversationPhone.length === 0) {
      return { contactType: ContactClassificationType.UNKNOWN };
    }

    try {
      const contacts = await this.contactsPort.listContacts(1000);
      const match = contacts.find((contact) =>
        contact.phoneNumbers.some((phone) => this.isSamePhone(phone, normalizedConversationPhone))
      );

      if (match) {
        return {
          contactType: ContactClassificationType.CUSTOMER,
          externalId: match.resourceName
        };
      }
    } catch (error) {
      this.logger.warn(`contactsBackend lookup failed for conversation ${conversationId}. ${String(error)}`);
    }

    return { contactType: ContactClassificationType.UNKNOWN };
  }

  private async safeRunSemanticProbes(conversationId: string): Promise<SemanticProbeMatch[]> {
    const probes: Array<{ probeName: string; text: string }> = [
      { probeName: 'order_confirmation', text: 'Customer confirms order and intent to buy' },
      { probeName: 'payment_intent', text: 'Customer asks to pay or confirms payment transfer' },
      { probeName: 'post_delivery_feedback', text: 'Customer already received product and gives feedback' },
      { probeName: 'support_issue', text: 'Customer reports problem with delivered product' },
      { probeName: 'unsolicited_seller', text: 'Someone trying to sell us external products or services' },
      { probeName: 'brand_counterfeit', text: 'Counterfeiting or impersonation of our brand' }
    ];

    try {
      const probeVectors = await Promise.all(
        probes.map(async (probe) => ({
          probeName: probe.probeName,
          vector: await this.embeddingPort.embedText(probe.text)
        }))
      );

      return await this.qdrantConversationSearchPort.searchSemanticSignals(
        conversationId,
        probeVectors,
        this.conversationStageInferenceConfigPort.getConfig().semanticProbeTopK
      );
    } catch (error) {
      this.logger.warn(`Semantic probes failed for conversation ${conversationId}. ${String(error)}`);
      return [];
    }
  }

  private async safeClassifyWithLlm(
    conversationId: string,
    messages: ConversationMessageEvidence[],
    deterministicSignals: string[],
    semanticMatches: SemanticProbeMatch[]
  ): Promise<LlmStageClassificationResult | null> {
    const canTryLlm = this.conversationStageInferenceConfigPort.getConfig().allowLlmFallbackOnLowSignal;
    const hasEvidence =
      messages.length > 0 || deterministicSignals.length > 0 || semanticMatches.some((item) => item.matches.length > 0);

    if (!canTryLlm || !hasEvidence) {
      return null;
    }

    const command: LlmConversationClassificationCommand = {
      conversationId,
      messages,
      semanticMatches,
      deterministicSignals,
      allowedStages: Object.values(CustomerStage)
    };

    try {
      return await this.llmConversationStageClassifierPort.classify(command);
    } catch (error) {
      this.logger.warn(`LLM classification failed for conversation ${conversationId}. ${String(error)}`);
      return null;
    }
  }

  private resolveCurrentStage(
    deterministicSignals: string[],
    semanticMatches: SemanticProbeMatch[],
    llmClassification: LlmStageClassificationResult | null
  ): CustomerStage {
    const deterministicStage = this.resolveStageFromSignals(deterministicSignals);
    if (deterministicStage) {
      return deterministicStage;
    }

    const semanticStage = this.resolveStageFromSemanticMatches(semanticMatches);
    if (semanticStage) {
      return semanticStage;
    }

    if (llmClassification && !llmClassification.noHint && llmClassification.confidence !== 'LOW') {
      return llmClassification.currentStage;
    }

    return CustomerStage.UNIDENTIFIED;
  }

  private resolveStageFromSignals(signals: string[]): CustomerStage | null {
    if (signals.includes('brand_counterfeit')) {
      return CustomerStage.BRAND_COUNTERFEIT;
    }
    if (signals.includes('unsolicited_seller')) {
      return CustomerStage.UNSOLICITED_SELLER;
    }
    if (signals.includes('support_issue')) {
      return CustomerStage.SUPPORT_ISSUE;
    }
    if (signals.includes('post_delivery_feedback')) {
      return CustomerStage.POST_DELIVERY;
    }
    if (signals.includes('delivery_signal')) {
      return CustomerStage.DELIVERED;
    }
    if (signals.includes('shipping_signal')) {
      return CustomerStage.SHIPPED;
    }
    if (signals.includes('payment_intent')) {
      return CustomerStage.WAITING_PAYMENT;
    }
    if (signals.includes('order_confirmation')) {
      return CustomerStage.READY_TO_BUY;
    }

    return null;
  }

  private resolveStageFromSemanticMatches(semanticMatches: SemanticProbeMatch[]): CustomerStage | null {
    const minScore = this.conversationStageInferenceConfigPort.getConfig().semanticMinScore;
    const rankedMatches = semanticMatches
      .map((match) => ({
        probeName: match.probeName,
        score: Math.max(...match.matches.map((item) => item.score ?? 0), 0)
      }))
      .filter((match) => match.score >= minScore)
      .sort((left, right) => right.score - left.score);

    const bestMatch = rankedMatches[0];
    if (!bestMatch) {
      return null;
    }

    return this.resolveStageFromSignals([bestMatch.probeName]);
  }

  private buildMessageTimeline(
    messages: ConversationMessageEvidence[],
    currentStage: CustomerStage,
    existingStage: ConversationStage | null
  ): PreviousConversationStage[] {
    const sorted = [...messages].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const segments: PreviousConversationStage[] = [];

    for (const message of sorted) {
      const stage = this.resolveStageHintForMessage(message.text);
      if (!stage) {
        continue;
      }

      const currentSegment = segments.at(-1);
      if (currentSegment && currentSegment.stage === stage) {
        currentSegment.toMessageId = message.messageId;
        currentSegment.endDate = message.timestamp;
        continue;
      }

      segments.push({
        stage,
        fromMessageId: message.messageId,
        toMessageId: message.messageId,
        startDate: message.timestamp,
        endDate: message.timestamp
      });
    }

    if (segments.length === 0) {
      return this.fallbackPreviousStages(existingStage, currentStage, sorted);
    }

    const timeline = segments.at(-1)?.stage === currentStage ? segments.slice(0, -1) : segments;
    return timeline.slice(-100);
  }

  private fallbackPreviousStages(
    existingStage: ConversationStage | null,
    currentStage: CustomerStage,
    messages: ConversationMessageEvidence[]
  ): PreviousConversationStage[] {
    if (!existingStage) {
      return [];
    }

    if (existingStage.currentStage === currentStage) {
      return existingStage.previousStages;
    }

    const nowIso = new Date().toISOString();
    const fromMessageId = messages.at(0)?.messageId ?? 'unknown';
    const toMessageId = messages.at(-1)?.messageId ?? fromMessageId;
    const transitionRecord: PreviousConversationStage = {
      stage: existingStage.currentStage,
      fromMessageId,
      toMessageId,
      startDate: this.toIsoOrFallback(existingStage.lastStageUpdate, nowIso),
      endDate: nowIso
    };

    return [...existingStage.previousStages, transitionRecord].slice(-100);
  }

  private resolveStageHintForMessage(text: string): CustomerStage | null {
    return this.resolveStageFromSignals(this.detectSignalsFromText(text));
  }

  private buildDetectedSignals(
    deterministicSignals: string[],
    semanticMatches: SemanticProbeMatch[],
    llmClassification: LlmStageClassificationResult | null
  ): string[] {
    const signals = new Set<string>(deterministicSignals);

    const minScore = this.conversationStageInferenceConfigPort.getConfig().semanticMinScore;

    semanticMatches
      .filter((match) => match.matches.some((item) => (item.score ?? 0) >= minScore))
      .forEach((match) => {
        signals.add(`semantic_${match.probeName}`);
      });

    llmClassification?.detectedSignals.forEach((signal) => {
      signals.add(signal);
    });

    if (signals.size === 0) {
      signals.add('insufficient_evidence');
    }

    return Array.from(signals);
  }

  private buildInconsistencies(
    currentStage: CustomerStage,
    classificationSource: StageClassificationSource
  ): ConversationInconsistency[] {
    const issues: ConversationInconsistency[] = [];

    if (
      classificationSource.contactType === ContactClassificationType.PROSPECT &&
      this.isCustomerAfterSalesStage(currentStage)
    ) {
      issues.push({
        type: ConversationInconsistencyType.STAGE_MISMATCH,
        message: 'Conversation marked as PROSPECT but contains post-sales lifecycle signals.'
      });
    }

    if (
      classificationSource.contactType === ContactClassificationType.CUSTOMER &&
      currentStage === CustomerStage.NEW_LEAD
    ) {
      issues.push({
        type: ConversationInconsistencyType.LABEL_CONFLICT,
        message: 'Conversation marked as CUSTOMER but stage was classified as NEW_LEAD.'
      });
    }

    return issues;
  }

  private resolveSummary(llmClassification: LlmStageClassificationResult | null): string {
    if (llmClassification?.summary && llmClassification.summary.trim().length > 0) {
      return llmClassification.summary.trim();
    }

    return 'No clear evidence yet to classify the conversation lifecycle stage with confidence.';
  }

  private resolveProspectExternalId(conversationId: string): string | null {
    const normalized = conversationId.trim();
    return /^p\s+\S+/i.test(normalized) ? normalized : null;
  }

  private resolveSalesExternalId(conversationId: string): string | null {
    const normalized = conversationId.trim();
    const prefixes = this.conversationStageInferenceConfigPort.getConfig().salesCodePrefixes;
    const hasSalesPrefix = prefixes.some((prefix) => normalized.toUpperCase().startsWith(prefix.toUpperCase()));
    return hasSalesPrefix ? normalized : null;
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }

  private isSamePhone(left: string, right: string): boolean {
    const normalizedLeft = this.normalizePhone(left);
    const normalizedRight = this.normalizePhone(right);
    const minComparableLength = 7;

    if (normalizedLeft.length < minComparableLength || normalizedRight.length < minComparableLength) {
      return false;
    }

    return normalizedLeft.endsWith(normalizedRight) || normalizedRight.endsWith(normalizedLeft);
  }

  private containsAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }

  private isCustomerAfterSalesStage(stage: CustomerStage): boolean {
    return [
      CustomerStage.IN_PRODUCTION,
      CustomerStage.SHIPPED,
      CustomerStage.DELIVERED,
      CustomerStage.POST_DELIVERY,
      CustomerStage.SUPPORT_ISSUE
    ].includes(stage);
  }

  private toIsoOrFallback(value: string, fallbackIso: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallbackIso : parsed.toISOString();
  }

  private isCacheExpired(lastStageUpdate: string): boolean {
    const parsed = new Date(lastStageUpdate);
    if (Number.isNaN(parsed.getTime())) {
      return true;
    }

    const ttlMs = this.conversationStageInferenceConfigPort.getConfig().recomputeTtlMinutes * 60_000;
    return Date.now() - parsed.getTime() > ttlMs;
  }
}
