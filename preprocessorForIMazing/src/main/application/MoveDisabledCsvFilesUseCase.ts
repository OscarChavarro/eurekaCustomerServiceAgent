import * as path from 'path';

import { DisabledConversationMatcher } from '../domain/DisabledConversationMatcher';
import { NameNormalizer } from '../domain/NameNormalizer';
import { FileSystemPort, LoggerPort } from './ports';

export type MoveDisabledCsvFilesResult = {
  movedCsvFiles: string[];
};

export class MoveDisabledCsvFilesUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly nameNormalizer: NameNormalizer,
    private readonly matcher: DisabledConversationMatcher,
    private readonly logger: LoggerPort
  ) {}

  async execute(rootFolderPath: string, csvFolderPath: string, disabledPatterns: string[]): Promise<MoveDisabledCsvFilesResult> {
    const movedCsvFiles: string[] = [];
    const csvDisabledFolderPath = path.join(rootFolderPath, 'csv_disabled');
    const fileNames = await this.fileSystem.listFiles(csvFolderPath);
    const csvFiles = fileNames.filter((fileName: string) => fileName.toLowerCase().endsWith('.csv'));

    for (const csvFileName of csvFiles) {
      const conversationName = this.nameNormalizer.removeWhatsAppPrefix(this.nameNormalizer.removeExtension(csvFileName));
      if (!this.matcher.isDisabledConversation(conversationName, disabledPatterns)) {
        continue;
      }

      const currentPath = path.join(csvFolderPath, csvFileName);
      const targetPath = path.join(csvDisabledFolderPath, csvFileName);
      const targetExists = await this.fileSystem.exists(targetPath);
      if (targetExists) {
        this.logger.warn(`Skipping disabled CSV move because target already exists: csv_disabled/${csvFileName}`);
        continue;
      }

      await this.fileSystem.rename(currentPath, targetPath);
      this.logger.info(`Disabled CSV moved: ${csvFileName} -> csv_disabled/${csvFileName}`);
      movedCsvFiles.push(csvFileName);
    }

    return { movedCsvFiles };
  }
}
