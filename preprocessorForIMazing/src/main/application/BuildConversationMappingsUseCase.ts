import * as path from 'path';

import { CsvRecord, ConversationMapping } from '../domain/Conversation';
import { NameNormalizer } from '../domain/NameNormalizer';
import { ResolveConversationPhoneNumberUseCase } from './ResolveConversationPhoneNumberUseCase';
import { CsvParserPort, FileSystemPort, LoggerPort } from './ports';

export interface BuildConversationMappingsResult {
  mappings: ConversationMapping[];
  unprocessedCsvFiles: string[];
}

export class BuildConversationMappingsUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly csvParser: CsvParserPort,
    private readonly nameNormalizer: NameNormalizer,
    private readonly resolveConversationPhoneNumberUseCase: ResolveConversationPhoneNumberUseCase,
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
      const originalBaseName: string = this.nameNormalizer.removeExtension(csvFileName);
      const cleanConversationName: string = this.nameNormalizer.removeWhatsAppPrefix(originalBaseName);
      const phoneNumber: string | null = await this.resolveConversationPhoneNumberUseCase.execute({
        records,
        conversationName: cleanConversationName
      });

      if (phoneNumber === null) {
        unprocessedCsvFiles.push(csvFileName);
        this.logger.warn(`No phone number strategy matched for ${csvFileName}`);
        continue;
      }

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
