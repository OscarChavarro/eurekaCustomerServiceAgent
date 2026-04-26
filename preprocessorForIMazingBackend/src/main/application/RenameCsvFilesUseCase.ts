import * as path from 'path';

import { ConversationMapping } from '../domain/Conversation';
import { NameNormalizer } from '../domain/NameNormalizer';
import { FileSystemPort, LoggerPort } from './ports';

export class RenameCsvFilesUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly nameNormalizer: NameNormalizer,
    private readonly logger: LoggerPort
  ) {}

  async execute(csvFolderPath: string, mappings: ConversationMapping[]): Promise<void> {
    for (const mapping of mappings) {
      const currentPath: string = path.join(csvFolderPath, mapping.csvFileName);
      const targetFileName: string = this.nameNormalizer.buildCsvTargetFileName(mapping.phoneNumber);
      const targetPath: string = path.join(csvFolderPath, targetFileName);

      if (currentPath === targetPath) {
        continue;
      }

      if (await this.fileSystem.exists(targetPath)) {
        this.logger.warn(`Skipping CSV rename because target already exists: ${targetFileName}`);
        continue;
      }

      await this.fileSystem.rename(currentPath, targetPath);
      this.logger.info(`CSV renamed: ${mapping.csvFileName} -> ${targetFileName}`);
    }
  }
}
