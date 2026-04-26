import * as path from 'path';

import { CsvRecord } from '../domain/Conversation';
import { FacebookConfirmationConversationDetector } from '../domain/FacebookConfirmationConversationDetector';
import { CsvParserPort, FileSystemPort, LoggerPort } from './ports';

export type MoveFacebookConfirmationCsvFilesResult = {
  movedCsvFiles: string[];
};

export class MoveFacebookConfirmationCsvFilesUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly csvParser: CsvParserPort,
    private readonly detector: FacebookConfirmationConversationDetector,
    private readonly logger: LoggerPort
  ) {}

  async execute(rootFolderPath: string, csvFolderPath: string): Promise<MoveFacebookConfirmationCsvFilesResult> {
    const unsupportedFolderPath = path.join(rootFolderPath, 'csv_unsupported');
    const movedCsvFiles: string[] = [];
    const fileNames = await this.fileSystem.listFiles(csvFolderPath);
    const csvFiles = fileNames.filter((fileName: string) => fileName.toLowerCase().endsWith('.csv'));

    for (const csvFileName of csvFiles) {
      const currentPath = path.join(csvFolderPath, csvFileName);
      const content = await this.fileSystem.readTextFile(currentPath);
      const records: CsvRecord[] = this.csvParser.parse(content);

      if (!this.detector.isFacebookConfirmationConversation(records)) {
        continue;
      }

      const targetPath = path.join(unsupportedFolderPath, csvFileName);
      const targetExists = await this.fileSystem.exists(targetPath);
      if (targetExists) {
        this.logger.warn(
          `Skipping Facebook confirmation CSV move because target already exists: csv_unsupported/${csvFileName}`
        );
        continue;
      }

      await this.fileSystem.rename(currentPath, targetPath);
      this.logger.info(`Facebook confirmation CSV moved: ${csvFileName} -> csv_unsupported/${csvFileName}`);
      movedCsvFiles.push(csvFileName);
    }

    return { movedCsvFiles };
  }
}
