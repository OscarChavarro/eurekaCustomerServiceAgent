import { Injectable, Logger } from '@nestjs/common';
import type { KwoledgeIngestionMessage } from './kwoledge-ingestion-message.model';

@Injectable()
export class ConversationMessageCleaningService {
  private readonly logger = new Logger(ConversationMessageCleaningService.name);

  public clean(messages: KwoledgeIngestionMessage[]): KwoledgeIngestionMessage[] {
    this.logger.log('PENDING TO PROCESS');
    return messages;
  }

  public isReadyForEmbeddingIngestion(): boolean {
    return false;
  }
}
