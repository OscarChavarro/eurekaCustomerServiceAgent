import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../../infrastructure/config/service.config';
import type {
  ConversationStageInferenceConfig,
  ConversationStageInferenceConfigPort
} from '../../../ports/outbound/conversation-stage-inference-config.port';

@Injectable()
export class ServiceConversationStageInferenceConfigAdapter implements ConversationStageInferenceConfigPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getConfig(): ConversationStageInferenceConfig {
    const inferenceConfig = this.serviceConfig.inferenceConfig;

    return {
      maxMessagesPerConversation: inferenceConfig.maxMessagesPerConversation,
      semanticProbeTopK: inferenceConfig.semanticProbeTopK,
      semanticMinScore: inferenceConfig.semanticMinScore,
      recomputeTtlMinutes: inferenceConfig.recomputeTtlMinutes,
      allowLlmFallbackOnLowSignal: inferenceConfig.allowLlmFallbackOnLowSignal,
      salesCodePrefixes: inferenceConfig.salesCodePrefixes
    };
  }
}
