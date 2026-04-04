import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class ProcessedConversationsFolderStartupValidator implements StartupValidator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'ProcessedConversationsFolderStartupValidator';
  }

  public getSuccessMessage(): string {
    return `Processed conversations folder check succeeded: ${this.serviceConfig.processedConversationsOutputPath}`;
  }

  public async validate(): Promise<void> {
    const folderPath = this.serviceConfig.processedConversationsOutputPath;
    const writeProbeFilePath = join(folderPath, '.write-probe');

    try {
      await fs.mkdir(folderPath, { recursive: true });
      await fs.writeFile(writeProbeFilePath, 'write-check', { encoding: 'utf-8', flag: 'w' });
      await fs.unlink(writeProbeFilePath);
    } catch (error) {
      throw new Error(
        `Can not write to folder ${folderPath} ... Waiting for pod to allow debugging... ${String(error)}`
      );
    }
  }
}
