import * as path from 'path';

import { NameNormalizer } from '../domain/NameNormalizer';
import { FileSystemPort, LoggerPort } from './ports';

export class MoveGroupMediaFoldersUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly nameNormalizer: NameNormalizer,
    private readonly logger: LoggerPort
  ) {}

  async execute(mediaFolderPath: string, groupNormalizedNames: string[]): Promise<void> {
    const groupsFolderPath = path.join(mediaFolderPath, '_groups');
    await this.fileSystem.ensureDirectory(groupsFolderPath);

    const groups = new Set<string>(groupNormalizedNames);
    if (groups.size === 0) {
      return;
    }

    const mediaFolderNames = await this.fileSystem.listDirectories(mediaFolderPath);
    for (const folderName of mediaFolderNames) {
      if (folderName === '_groups') {
        continue;
      }

      const normalizedFolderName = this.nameNormalizer.normalizeForMatch(this.nameNormalizer.removeWhatsAppPrefix(folderName));
      if (!groups.has(normalizedFolderName)) {
        continue;
      }

      const currentFolderPath = path.join(mediaFolderPath, folderName);
      const targetFolderPath = path.join(groupsFolderPath, folderName);
      const targetExists = await this.fileSystem.exists(targetFolderPath);
      if (targetExists) {
        this.logger.warn(`Skipping group media move because target already exists: _groups/${folderName}`);
        continue;
      }

      await this.fileSystem.rename(currentFolderPath, targetFolderPath);
      this.logger.info(`Group media folder moved: ${folderName} -> media/_groups/${folderName}`);
    }
  }
}
