import { Inject, Injectable } from '@nestjs/common';
import type {
  ConversationsRepositoryPort,
  RawConversationAudioMessage
} from '../../ports/outbound/conversations-repository.port';
import { TOKENS } from '../../ports/tokens';
import type { RawAudioTranscriptionCandidate } from '../../services/raw-audio-transcription-orchestrator.service';
import { RawAudioTranscriptionOrchestratorService } from '../../services/raw-audio-transcription-orchestrator.service';
import { FixFilePatternUseCase } from '../fix-file-pattern/fix-file-pattern.use-case';
import { UpdateAudioModelsResult } from './update-audio-models.result';

@Injectable()
export class UpdateAudioModelsUseCase {
  constructor(
    @Inject(TOKENS.ConversationsRepositoryPort)
    private readonly conversationsRepositoryPort: ConversationsRepositoryPort,
    private readonly rawAudioTranscriptionOrchestratorService: RawAudioTranscriptionOrchestratorService,
    private readonly fixFilePatternUseCase: FixFilePatternUseCase
  ) {}

  public async execute(): Promise<UpdateAudioModelsResult> {
    const rawAudioMessages =
      await this.conversationsRepositoryPort.findRawMessagesWithAudioAttachment();
    const filePatternFixResult = await this.fixFilePatternUseCase.execute(rawAudioMessages);
    const retryCandidates = rawAudioMessages.filter(
      (rawAudioMessage) => rawAudioMessage.audioDetails?.type !== 'voice'
    );
    const queuedJobs = this.rawAudioTranscriptionOrchestratorService.enqueueMany(
      retryCandidates.map((retryCandidate) =>
        this.toTranscriptionCandidate(
          retryCandidate,
          filePatternFixResult.resolvedFilePatternByConversationId
        )
      )
    );

    return new UpdateAudioModelsResult(
      rawAudioMessages.length,
      rawAudioMessages.length - retryCandidates.length,
      retryCandidates.length,
      queuedJobs
    );
  }

  private toTranscriptionCandidate(
    rawAudioMessage: RawConversationAudioMessage,
    resolvedFilePatternByConversationId: Map<string, string | null>
  ): RawAudioTranscriptionCandidate {
    const resolvedFilePattern =
      resolvedFilePatternByConversationId.get(rawAudioMessage.conversationId) ??
      rawAudioMessage.conversationFilePattern;

    return {
      conversationId: rawAudioMessage.conversationId,
      rawMessageExternalId: rawAudioMessage.rawMessageExternalId,
      conversationFilePattern: resolvedFilePattern,
      rawMessageSentAt: rawAudioMessage.rawMessageSentAt,
      normalizedFields: {
        chatSession: rawAudioMessage.normalizedFields.chatSession,
        messageDate: rawAudioMessage.normalizedFields.messageDate,
        attachment: rawAudioMessage.normalizedFields.attachment
      }
    };
  }
}
