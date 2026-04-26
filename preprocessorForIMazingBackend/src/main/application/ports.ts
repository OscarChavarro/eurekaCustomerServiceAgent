import { CsvRecord } from '../domain/Conversation';

export interface FileSystemPort {
  exists(path: string): Promise<boolean>;
  ensureDirectory(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
  listFilesRecursively(path: string): Promise<string[]>;
  listDirectories(path: string): Promise<string[]>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  areFilesEqual(leftPath: string, rightPath: string): Promise<boolean>;
  rename(oldPath: string, newPath: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  removeEmptyDirectoriesRecursively(path: string): Promise<void>;
}

export interface CsvParserPort {
  parse(content: string): CsvRecord[];
}

export interface ContactEntry {
  names: string[];
  phoneNumbers: string[];
}

export interface ContactsBackendPort {
  assertHealth(): Promise<void>;
  listContacts(): Promise<ContactEntry[]>;
  getContactsHash(): Promise<string>;
}

export interface LoggerPort {
  info(message: string): void;
  warn(message: string): void;
}

export interface DisabledContactsPort {
  load(): Promise<string[]>;
}
