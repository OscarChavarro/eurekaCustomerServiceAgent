import * as path from 'path';

import { FileSystemPort } from './ports';

export class EnsureAuxiliaryCsvFoldersUseCase {
  constructor(private readonly fileSystem: FileSystemPort) {}

  async execute(rootFolderPath: string): Promise<void> {
    await this.fileSystem.ensureDirectory(path.join(rootFolderPath, 'csv_groups'));
    await this.fileSystem.ensureDirectory(path.join(rootFolderPath, 'csv_disabled'));
    await this.fileSystem.ensureDirectory(path.join(rootFolderPath, 'csv_unsupported'));
  }
}
