import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ProcessedConversationStageStorePort } from '../../../application/ports/outbound/processed-conversation-stage-store.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class FileSystemProcessedConversationStageStoreAdapter
  implements ProcessedConversationStageStorePort
{
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async saveConversationStages(
    conversationId: string,
    stages: unknown
  ): Promise<void> {
    const filePath = join(
      this.serviceConfig.processedConversationsOutputPath,
      `${this.sanitizeFileName(conversationId)}.json`
    );
    const content = JSON.stringify(stages, null, 2);

    await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'w' });
  }

  private sanitizeFileName(fileName: string): string {
    const trimmed = fileName.trim();

    if (trimmed.length === 0) {
      return 'unknown-conversation';
    }

    return trimmed.replace(/[^a-zA-Z0-9._ -]/g, '_');
  }
}
