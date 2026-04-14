import * as path from 'path';

import { CsvRecord, ConversationMapping } from '../domain/Conversation';
import { NameNormalizer } from '../domain/NameNormalizer';
import { PhoneNumberExtractor } from '../domain/PhoneNumberExtractor';
import { CsvParserPort, FileSystemPort, LoggerPort } from './ports';

export interface BuildConversationMappingsResult {
  mappings: ConversationMapping[];
  unprocessedCsvFiles: string[];
}

export class BuildConversationMappingsUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly csvParser: CsvParserPort,
    private readonly phoneNumberExtractor: PhoneNumberExtractor,
    private readonly nameNormalizer: NameNormalizer,
    private readonly logger: LoggerPort
  ) {}

  async execute(csvFolderPath: string): Promise<BuildConversationMappingsResult> {
    const fileNames: string[] = await this.fileSystem.listFiles(csvFolderPath);
    const csvFiles: string[] = fileNames.filter((fileName: string) => fileName.toLowerCase().endsWith('.csv'));
    const mappings: ConversationMapping[] = [];
    const unprocessedCsvFiles: string[] = [];

    for (const csvFileName of csvFiles) {
      const csvPath: string = path.join(csvFolderPath, csvFileName);
      const content: string = await this.fileSystem.readTextFile(csvPath);
      const records: CsvRecord[] = this.csvParser.parse(content);
      const phoneNumber: string | null = this.phoneNumberExtractor.extract(records);

      if (phoneNumber === null) {
        unprocessedCsvFiles.push(csvFileName);
        this.logger.warn(`No incoming phone number found in ${csvFileName}`);
        continue;
      }

      const originalBaseName: string = this.nameNormalizer.removeExtension(csvFileName);
      mappings.push({
        csvFileName,
        originalBaseName,
        normalizedBaseName: this.nameNormalizer.normalizeForMatch(originalBaseName),
        phoneNumber
      });
    }

    return { mappings, unprocessedCsvFiles };
  }
}
