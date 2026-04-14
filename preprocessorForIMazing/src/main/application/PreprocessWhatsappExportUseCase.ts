import * as path from 'path';

import { NameNormalizer } from '../domain/NameNormalizer';
import { PhoneNumberExtractor } from '../domain/PhoneNumberExtractor';
import { BuildConversationMappingsUseCase } from './BuildConversationMappingsUseCase';
import { ResolveConversationPhoneNumberUseCase } from './ResolveConversationPhoneNumberUseCase';
import { ContactsBackendPort, CsvParserPort, FileSystemPort, LoggerPort } from './ports';
import { RenameCsvFilesUseCase } from './RenameCsvFilesUseCase';
import { RenameMediaUseCase } from './RenameMediaUseCase';
import { ResolvePhoneFromContactsBackendStrategy } from './strategies/ResolvePhoneFromContactsBackendStrategy';
import { ResolvePhoneFromIncomingMessageStrategy } from './strategies/ResolvePhoneFromIncomingMessageStrategy';
import { ResolvePhoneFromNumericConversationNameStrategy } from './strategies/ResolvePhoneFromNumericConversationNameStrategy';
import { WriteUnprocessedLogUseCase } from './WriteUnprocessedLogUseCase';

export class PreprocessWhatsappExportUseCase {
  private readonly buildConversationMappingsUseCase: BuildConversationMappingsUseCase;
  private readonly renameCsvFilesUseCase: RenameCsvFilesUseCase;
  private readonly renameMediaUseCase: RenameMediaUseCase;
  private readonly writeUnprocessedLogUseCase: WriteUnprocessedLogUseCase;
  private readonly contactsBackend: ContactsBackendPort;

  constructor(
    private readonly fileSystem: FileSystemPort,
    csvParser: CsvParserPort,
    contactsBackend: ContactsBackendPort,
    logger: LoggerPort
  ) {
    const nameNormalizer: NameNormalizer = new NameNormalizer();
    const phoneNumberExtractor: PhoneNumberExtractor = new PhoneNumberExtractor();
    const resolveConversationPhoneNumberUseCase = new ResolveConversationPhoneNumberUseCase([
      new ResolvePhoneFromIncomingMessageStrategy(phoneNumberExtractor),
      new ResolvePhoneFromNumericConversationNameStrategy(),
      new ResolvePhoneFromContactsBackendStrategy(contactsBackend, nameNormalizer, logger)
    ]);

    this.contactsBackend = contactsBackend;

    this.buildConversationMappingsUseCase = new BuildConversationMappingsUseCase(
      fileSystem,
      csvParser,
      nameNormalizer,
      resolveConversationPhoneNumberUseCase,
      logger
    );
    this.renameCsvFilesUseCase = new RenameCsvFilesUseCase(fileSystem, nameNormalizer, logger);
    this.renameMediaUseCase = new RenameMediaUseCase(fileSystem, nameNormalizer, logger);
    this.writeUnprocessedLogUseCase = new WriteUnprocessedLogUseCase(fileSystem);
  }

  async execute(rootFolderPath: string): Promise<void> {
    await this.contactsBackend.assertHealth();

    const csvFolderPath: string = path.join(rootFolderPath, 'csv');
    const mediaFolderPath: string = path.join(rootFolderPath, 'media');

    const csvExists: boolean = await this.fileSystem.exists(csvFolderPath);
    const mediaExists: boolean = await this.fileSystem.exists(mediaFolderPath);

    if (!csvExists || !mediaExists) {
      throw new Error('The provided root folder must contain both csv and media subfolders.');
    }

    const result = await this.buildConversationMappingsUseCase.execute(csvFolderPath);
    await this.renameCsvFilesUseCase.execute(csvFolderPath, result.mappings);
    await this.renameMediaUseCase.execute(mediaFolderPath, result.mappings);
    await this.writeUnprocessedLogUseCase.execute(rootFolderPath, result.unprocessedCsvFiles);
  }
}
