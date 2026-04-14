import * as path from 'path';

import { CsvRecord } from '../domain/Conversation';
import { GroupConversationDetector } from '../domain/GroupConversationDetector';
import { NameNormalizer } from '../domain/NameNormalizer';
import { CsvParserPort, FileSystemPort, LoggerPort } from './ports';

export type MoveGroupCsvFilesResult = {
  movedGroupNormalizedNames: string[];
};

export class MoveGroupCsvFilesUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly csvParser: CsvParserPort,
    private readonly nameNormalizer: NameNormalizer,
    private readonly groupConversationDetector: GroupConversationDetector,
    private readonly logger: LoggerPort
  ) {}

  async execute(rootFolderPath: string, csvFolderPath: string): Promise<MoveGroupCsvFilesResult> {
    const csvGroupsFolderPath = path.join(rootFolderPath, 'csv_groups');
    const fileNames = await this.fileSystem.listFiles(csvFolderPath);
    const csvFiles = fileNames.filter((fileName: string) => fileName.toLowerCase().endsWith('.csv'));
    const movedGroupNormalizedNames = new Set<string>();

    for (const csvFileName of csvFiles) {
      const currentPath = path.join(csvFolderPath, csvFileName);
      const content = await this.fileSystem.readTextFile(currentPath);
      const records: CsvRecord[] = this.csvParser.parse(content);
      const conversationName = this.nameNormalizer.removeWhatsAppPrefix(this.nameNormalizer.removeExtension(csvFileName));

      if (!this.groupConversationDetector.isGroupConversation(records, conversationName)) {
        continue;
      }

      const targetPath = path.join(csvGroupsFolderPath, csvFileName);
      const targetExists = await this.fileSystem.exists(targetPath);
      if (targetExists) {
        this.logger.warn(`Skipping group CSV move because target already exists: ${csvFileName}`);
        continue;
      }

      await this.fileSystem.rename(currentPath, targetPath);
      this.logger.info(`Group CSV moved: ${csvFileName} -> csv_groups/${csvFileName}`);
      movedGroupNormalizedNames.add(this.nameNormalizer.normalizeForMatch(conversationName));
    }

    return {
      movedGroupNormalizedNames: Array.from(movedGroupNormalizedNames)
    };
  }
}
