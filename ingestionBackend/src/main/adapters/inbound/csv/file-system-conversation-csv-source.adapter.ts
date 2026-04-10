import { Inject, Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import type {
  ConversationCsvSourcePort,
  ConversationCsvRawRecord
} from '../../../application/ports/inbound/conversation-csv-source.port';
import type {
  ContactDirectoryContact,
  ContactsDirectoryPort
} from '../../../application/ports/outbound/contacts-directory.port';
import { TOKENS } from '../../../application/ports/tokens';
import { ContactsDirectoryIndexService } from './contacts-directory-index.service';
import { ImazingCsvFileNameService } from './imazing-csv-file-name.service';

type ProcessableCsvFile = {
  kind: 'processable';
  csvPath: string;
  sourceFile: string;
  filePattern: string;
  conversationId: string;
  contactName: string | null;
  foundInContactsHashmap: boolean;
  matchedWithUnicodeReplacementRetry: boolean;
};

type UnsupportedCsvFile = {
  kind: 'unsupported';
  sourceFile: string;
  movedToPath: string;
  foundInContactsHashmap: boolean;
  matchedWithUnicodeReplacementRetry: boolean;
};

type CsvFileResolution = ProcessableCsvFile | UnsupportedCsvFile;

type ContactsDirectoryLoadSummary = {
  contactsCount: number;
  indexedNames: number;
};

@Injectable()
export class FileSystemConversationCsvSourceAdapter implements ConversationCsvSourcePort {
  private readonly logger = new Logger(FileSystemConversationCsvSourceAdapter.name);
  private contactsByNameIndex = new Map<string, string[]>();
  private contactsByImazingUnicodeReplacementNameIndex = new Map<string, string[]>();
  private contactNameByNormalizedPhoneIndex = new Map<string, string>();

  constructor(
    @Inject(TOKENS.ContactsDirectoryPort)
    private readonly contactsDirectoryPort: ContactsDirectoryPort,
    private readonly contactsDirectoryIndexService: ContactsDirectoryIndexService,
    private readonly imazingCsvFileNameService: ImazingCsvFileNameService
  ) {}

  public async readFromPath(path: string): Promise<ConversationCsvRawRecord[]> {
    const resolvedPath = this.resolveInputPath(path);
    const contactsDirectoryLoadSummary = await this.loadContactsDirectory();
    this.logger.log(
      `Imported ${contactsDirectoryLoadSummary.contactsCount} contacts into contacts hashmap. Indexed names: ${contactsDirectoryLoadSummary.indexedNames}`
    );

    const pathStats = await fs.stat(resolvedPath);
    const rawRecords: ConversationCsvRawRecord[] = [];

    if (pathStats.isFile()) {
      if (extname(resolvedPath).toLowerCase() !== '.csv') {
        throw new Error(`Path is a file but not a CSV file: ${resolvedPath}`);
      }

      const resolution = await this.resolveCsvFile(resolvedPath);

      if (resolution.kind === 'unsupported') {
        this.logger.warn(
          `[1/1] Unsupported contact CSV skipped and moved to: ${resolution.movedToPath}. Found in contacts hashmap: ${this.toYesNo(resolution.foundInContactsHashmap)}. Unicode replacement retry used: ${this.toYesNo(resolution.matchedWithUnicodeReplacementRetry)}.`
        );
        return rawRecords;
      }

      this.logger.log(
        `[1/1] Reading CSV file: ${resolution.sourceFile}. Found in contacts hashmap: ${this.toYesNo(resolution.foundInContactsHashmap)}. Unicode replacement retry used: ${this.toYesNo(resolution.matchedWithUnicodeReplacementRetry)}.`
      );
      const csvRecords = await this.readCsvFile(
        resolution.csvPath,
        resolution.sourceFile,
        resolution.filePattern,
        resolution.conversationId,
        resolution.contactName
      );
      rawRecords.push(...csvRecords);
      this.logger.log(
        `[1/1] Loaded rows: ${csvRecords.length} from ${resolution.sourceFile}. Found in contacts hashmap: ${this.toYesNo(resolution.foundInContactsHashmap)}. Unicode replacement retry used: ${this.toYesNo(resolution.matchedWithUnicodeReplacementRetry)}.`
      );
      return rawRecords;
    }

    if (!pathStats.isDirectory()) {
      throw new Error(`Path must be a CSV file or a directory: ${resolvedPath}`);
    }

    const folderEntries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const csvFileNames = folderEntries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.csv')
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    this.logger.log(
      `Discovered ${csvFileNames.length} CSV files in ${resolvedPath}. Starting ingestion.`
    );

    for (const [index, csvFileName] of csvFileNames.entries()) {
      const current = index + 1;
      const csvPath = join(resolvedPath, csvFileName);
      const resolution = await this.resolveCsvFile(csvPath);

      if (resolution.kind === 'unsupported') {
        this.logger.warn(
          `[${current}/${csvFileNames.length}] Unsupported CSV skipped and moved to: ${resolution.movedToPath}. Found in contacts hashmap: ${this.toYesNo(resolution.foundInContactsHashmap)}. Unicode replacement retry used: ${this.toYesNo(resolution.matchedWithUnicodeReplacementRetry)}.`
        );
        continue;
      }

      const csvRecords = await this.readCsvFile(
        resolution.csvPath,
        resolution.sourceFile,
        resolution.filePattern,
        resolution.conversationId,
        resolution.contactName
      );
      rawRecords.push(...csvRecords);
      this.logger.log(
        `[${current}/${csvFileNames.length}] Loaded rows: ${csvRecords.length} from ${resolution.sourceFile}. Found in contacts hashmap: ${this.toYesNo(resolution.foundInContactsHashmap)}. Unicode replacement retry used: ${this.toYesNo(resolution.matchedWithUnicodeReplacementRetry)}.`
      );
    }

    return rawRecords;
  }

  private async loadContactsDirectory(): Promise<ContactsDirectoryLoadSummary> {
    const contacts = await this.contactsDirectoryPort.listContacts();
    this.contactsByNameIndex = this.contactsDirectoryIndexService.buildNameToPhonesIndex(contacts);
    this.contactsByImazingUnicodeReplacementNameIndex =
      this.contactsDirectoryIndexService.buildImazingUnicodeReplacementNameToPhonesIndex(contacts);
    this.contactNameByNormalizedPhoneIndex = this.buildPhoneToNameIndex(contacts);

    return {
      contactsCount: contacts.length,
      indexedNames: this.contactsByNameIndex.size
    };
  }

  private async resolveCsvFile(csvPath: string): Promise<CsvFileResolution> {
    const sourceFile = basename(csvPath);
    // Keep the original iMazing filename pattern before any CSV rename to phone.
    const originalFilePatternBeforeRename = basename(csvPath, extname(csvPath)).trim();
    const sourceLabel = this.imazingCsvFileNameService.extractConversationLabel(sourceFile);
    const mappedPhone = this.contactsDirectoryIndexService.resolvePreferredPhoneNumber(
      sourceLabel,
      this.contactsByNameIndex
    );

    if (mappedPhone) {
      const normalizedMappedPhone = this.imazingCsvFileNameService.normalizePhoneLabel(mappedPhone);

      if (normalizedMappedPhone) {
        const renamedPath = await this.renameCsvToPhone(csvPath, normalizedMappedPhone);
        const renamedSourceFile = basename(renamedPath);

        return {
          kind: 'processable',
          csvPath: renamedPath,
          sourceFile: renamedSourceFile,
          filePattern: originalFilePatternBeforeRename,
          conversationId: normalizedMappedPhone,
          contactName: sourceLabel,
          foundInContactsHashmap: true,
          matchedWithUnicodeReplacementRetry: false
        };
      }
    }

    const mappedPhoneByUnicodeReplacementRetry =
      this.contactsDirectoryIndexService.resolvePreferredPhoneNumberWithImazingUnicodeReplacement(
        sourceLabel,
        this.contactsByImazingUnicodeReplacementNameIndex
      );

    if (mappedPhoneByUnicodeReplacementRetry) {
      const normalizedMappedPhoneByUnicodeReplacementRetry =
        this.imazingCsvFileNameService.normalizePhoneLabel(mappedPhoneByUnicodeReplacementRetry);

      if (normalizedMappedPhoneByUnicodeReplacementRetry) {
        const renamedPath = await this.renameCsvToPhone(
          csvPath,
          normalizedMappedPhoneByUnicodeReplacementRetry
        );
        const renamedSourceFile = basename(renamedPath);

        return {
          kind: 'processable',
          csvPath: renamedPath,
          sourceFile: renamedSourceFile,
          filePattern: originalFilePatternBeforeRename,
          conversationId: normalizedMappedPhoneByUnicodeReplacementRetry,
          contactName: sourceLabel,
          foundInContactsHashmap: true,
          matchedWithUnicodeReplacementRetry: true
        };
      }
    }

    const normalizedPhoneLabel = this.imazingCsvFileNameService.normalizePhoneLabel(sourceLabel);

    if (normalizedPhoneLabel) {
      const renamedPath = await this.renameCsvToPhone(csvPath, normalizedPhoneLabel);
      const renamedSourceFile = basename(renamedPath);
      const inferredOriginalPattern =
        this.resolveOriginalFilePatternByPhone(normalizedPhoneLabel) ??
        originalFilePatternBeforeRename;

      return {
        kind: 'processable',
        csvPath: renamedPath,
        sourceFile: renamedSourceFile,
        filePattern: inferredOriginalPattern,
        conversationId: normalizedPhoneLabel,
        contactName: null,
        foundInContactsHashmap: false,
        matchedWithUnicodeReplacementRetry: false
      };
    }

    const movedToPath = await this.moveToUnsupportedFolder(csvPath);

    return {
      kind: 'unsupported',
      sourceFile,
      movedToPath,
      foundInContactsHashmap: false,
      matchedWithUnicodeReplacementRetry: false
    };
  }

  private toYesNo(value: boolean): 'yes' | 'no' {
    return value ? 'yes' : 'no';
  }

  private buildPhoneToNameIndex(contacts: ContactDirectoryContact[]): Map<string, string> {
    const index = new Map<string, string>();

    for (const contact of contacts) {
      const preferredName = this.pickPreferredContactName(contact.names);
      if (!preferredName) {
        continue;
      }

      for (const phone of contact.phoneNumbers) {
        const normalizedPhone = this.imazingCsvFileNameService.normalizePhoneLabel(phone);
        if (!normalizedPhone) {
          continue;
        }

        const existing = index.get(normalizedPhone);
        if (!existing || preferredName.localeCompare(existing) < 0) {
          index.set(normalizedPhone, preferredName);
        }
      }
    }

    return index;
  }

  private pickPreferredContactName(names: string[]): string | null {
    for (const name of names) {
      const trimmed = name.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  private resolveOriginalFilePatternByPhone(normalizedPhone: string): string | null {
    const contactName = this.contactNameByNormalizedPhoneIndex.get(normalizedPhone);
    if (!contactName) {
      return null;
    }

    return `WhatsApp - ${contactName}`;
  }

  private async renameCsvToPhone(csvPath: string, phoneNumber: string): Promise<string> {
    const targetFileName = this.imazingCsvFileNameService.buildPhoneCsvFileName(phoneNumber);
    const targetPath = join(dirname(csvPath), targetFileName);

    if (csvPath === targetPath) {
      return csvPath;
    }

    try {
      await fs.access(targetPath);
      throw new Error(
        `Cannot rename ${csvPath} to ${targetPath} because target file already exists.`
      );
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code && nodeError.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.rename(csvPath, targetPath);

    this.logger.log(`Renamed CSV file based on contacts directory: ${csvPath} -> ${targetPath}`);

    return targetPath;
  }

  private async moveToUnsupportedFolder(csvPath: string): Promise<string> {
    const unsupportedFolderPath = resolve(process.cwd(), 'etc', '_chatsEureka', 'csv_unsupported');
    await fs.mkdir(unsupportedFolderPath, { recursive: true });

    const sourceFile = basename(csvPath);
    let targetPath = join(unsupportedFolderPath, sourceFile);

    if (targetPath === csvPath) {
      return targetPath;
    }

    targetPath = await this.ensureAvailableTargetPath(targetPath);
    await fs.rename(csvPath, targetPath);

    return targetPath;
  }

  private async ensureAvailableTargetPath(targetPath: string): Promise<string> {
    try {
      await fs.access(targetPath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return targetPath;
      }

      throw error;
    }

    const extension = extname(targetPath);
    const nameWithoutExtension =
      extension.length > 0 ? targetPath.slice(0, -extension.length) : targetPath;

    return `${nameWithoutExtension}__${Date.now()}${extension}`;
  }

  private async readCsvFile(
    csvPath: string,
    sourceFile: string,
    filePattern: string,
    conversationId: string,
    contactName: string | null
  ): Promise<ConversationCsvRawRecord[]> {
    const csvContent = await fs.readFile(csvPath, 'utf-8');
    const rows = parse(csvContent, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    }) as Record<string, unknown>[];

    return rows.map((row, rowIndex) => ({
      sourceFile,
      filePattern,
      rowNumber: rowIndex + 1,
      conversationId,
      contactName,
      fields: this.normalizeFieldValues(row)
    }));
  }

  private resolveInputPath(path: string): string {
    if (isAbsolute(path)) {
      return path;
    }

    return resolve(process.cwd(), path);
  }

  private normalizeFieldValues(row: Record<string, unknown>): Record<string, string> {
    const normalizedFields: Record<string, string> = {};

    Object.entries(row).forEach(([key, value]) => {
      normalizedFields[key] = this.toStringValue(value);
    });

    return normalizedFields;
  }

  private toStringValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value).trim();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return JSON.stringify(value);
  }
}
