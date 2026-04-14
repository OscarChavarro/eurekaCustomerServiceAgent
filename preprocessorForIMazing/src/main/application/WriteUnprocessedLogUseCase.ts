import * as path from 'path';

import { FileSystemPort } from './ports';

export class WriteUnprocessedLogUseCase {
  constructor(private readonly fileSystem: FileSystemPort) {}

  async execute(rootFolderPath: string, unprocessedCsvFiles: string[]): Promise<void> {
    const outlogFolderPath: string = path.join(rootFolderPath, 'outlog');
    const outlogFilePath: string = path.join(outlogFolderPath, 'unprocessed.txt');
    await this.fileSystem.ensureDirectory(outlogFolderPath);
    const content: string = unprocessedCsvFiles.join('\n');
    await this.fileSystem.writeTextFile(outlogFilePath, content.length > 0 ? `${content}\n` : '');
  }
}
