import * as path from 'path';

import { EnsureAuxiliaryCsvFoldersUseCase } from './EnsureAuxiliaryCsvFoldersUseCase';
import { NameNormalizer } from '../domain/NameNormalizer';
import { GroupConversationDetector } from '../domain/GroupConversationDetector';
import { PhoneNumberExtractor } from '../domain/PhoneNumberExtractor';
import { BuildConversationMappingsUseCase } from './BuildConversationMappingsUseCase';
import { MoveGroupCsvFilesUseCase } from './MoveGroupCsvFilesUseCase';
import { MoveGroupMediaFoldersUseCase } from './MoveGroupMediaFoldersUseCase';
import { MoveUnsupportedCsvFilesUseCase } from './MoveUnsupportedCsvFilesUseCase';
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
  private readonly ensureAuxiliaryCsvFoldersUseCase: EnsureAuxiliaryCsvFoldersUseCase;
  private readonly moveGroupCsvFilesUseCase: MoveGroupCsvFilesUseCase;
  private readonly moveGroupMediaFoldersUseCase: MoveGroupMediaFoldersUseCase;
  private readonly moveUnsupportedCsvFilesUseCase: MoveUnsupportedCsvFilesUseCase;
  private readonly contactsBackend: ContactsBackendPort;

  constructor(
    private readonly fileSystem: FileSystemPort,
    csvParser: CsvParserPort,
    contactsBackend: ContactsBackendPort,
    logger: LoggerPort
  ) {
    const nameNormalizer: NameNormalizer = new NameNormalizer();
    const groupConversationDetector = new GroupConversationDetector(nameNormalizer);
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
    this.ensureAuxiliaryCsvFoldersUseCase = new EnsureAuxiliaryCsvFoldersUseCase(fileSystem);
    this.moveGroupCsvFilesUseCase = new MoveGroupCsvFilesUseCase(
      fileSystem,
      csvParser,
      nameNormalizer,
      groupConversationDetector,
      logger
    );
    this.moveGroupMediaFoldersUseCase = new MoveGroupMediaFoldersUseCase(fileSystem, nameNormalizer, logger);
    this.moveUnsupportedCsvFilesUseCase = new MoveUnsupportedCsvFilesUseCase(fileSystem, logger);
  }

  async execute(rootFolderPath: string): Promise<void> {
    const csvFolderPath: string = path.join(rootFolderPath, 'csv');
    const mediaFolderPath: string = path.join(rootFolderPath, 'media');

    const csvExists: boolean = await this.fileSystem.exists(csvFolderPath);
    const mediaExists: boolean = await this.fileSystem.exists(mediaFolderPath);

    if (!csvExists || !mediaExists) {
      throw new Error('The provided root folder must contain both csv and media subfolders.');
    }

    await this.ensureAuxiliaryCsvFoldersUseCase.execute(rootFolderPath);
    const groupedConversations = await this.moveGroupCsvFilesUseCase.execute(rootFolderPath, csvFolderPath);
    await this.moveGroupMediaFoldersUseCase.execute(mediaFolderPath, groupedConversations.movedGroupNormalizedNames);
    await this.contactsBackend.assertHealth();

    const result = await this.buildConversationMappingsUseCase.execute(csvFolderPath);
    await this.renameCsvFilesUseCase.execute(csvFolderPath, result.mappings);
    await this.renameMediaUseCase.execute(mediaFolderPath, result.mappings);
    const moveUnsupportedResult = await this.moveUnsupportedCsvFilesUseCase.execute(
      rootFolderPath,
      csvFolderPath,
      result.unprocessedCsvFiles
    );
    await this.writeUnprocessedLogUseCase.execute(rootFolderPath, moveUnsupportedResult.movedCsvFiles);
  }
}
