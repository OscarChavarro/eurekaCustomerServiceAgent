import { CsvRecord } from '../domain/Conversation';

export interface FileSystemPort {
  exists(path: string): Promise<boolean>;
  ensureDirectory(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
  listDirectories(path: string): Promise<string[]>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}

export interface CsvParserPort {
  parse(content: string): CsvRecord[];
}

export interface LoggerPort {
  info(message: string): void;
  warn(message: string): void;
}
