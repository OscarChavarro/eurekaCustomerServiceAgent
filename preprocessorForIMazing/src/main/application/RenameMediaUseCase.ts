import * as path from 'path';

import { ConversationMapping } from '../domain/Conversation';
import { NameNormalizer } from '../domain/NameNormalizer';
import { FileSystemPort, LoggerPort } from './ports';

export class RenameMediaUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly nameNormalizer: NameNormalizer,
    private readonly logger: LoggerPort
  ) {}

  async execute(mediaFolderPath: string, mappings: ConversationMapping[]): Promise<void> {
    const mappingByOriginalName: Map<string, ConversationMapping> = new Map<string, ConversationMapping>();
    const mappingByNormalizedName: Map<string, ConversationMapping> = new Map<string, ConversationMapping>();

    for (const mapping of mappings) {
      mappingByOriginalName.set(mapping.originalBaseName, mapping);
      mappingByNormalizedName.set(mapping.normalizedBaseName, mapping);
    }

    const folders: string[] = await this.fileSystem.listDirectories(mediaFolderPath);
    for (const folderName of folders) {
      const mapping: ConversationMapping | undefined = this.findMapping(folderName, mappingByOriginalName, mappingByNormalizedName);
      if (mapping === undefined) {
        this.logger.warn(`No matching CSV mapping found for media folder: ${folderName}`);
        continue;
      }

      const currentFolderPath: string = path.join(mediaFolderPath, folderName);
      const targetFolderName: string = this.nameNormalizer.buildMediaTargetFolderName(mapping.phoneNumber);
      const targetFolderPath: string = path.join(mediaFolderPath, targetFolderName);
      const workingFolderPath: string = await this.renameFolderIfNeeded(currentFolderPath, targetFolderPath, folderName, targetFolderName);

      const fileNames: string[] = await this.fileSystem.listFiles(workingFolderPath);
      for (const fileName of fileNames) {
        const targetFileName: string = this.nameNormalizer.buildMediaTargetFileName(fileName, mapping.originalBaseName);
        if (fileName === targetFileName) {
          continue;
        }

        const currentFilePath: string = path.join(workingFolderPath, fileName);
        const targetFilePath: string = path.join(workingFolderPath, targetFileName);
        if (await this.fileSystem.exists(targetFilePath)) {
          this.logger.warn(`Skipping media file rename because target already exists: ${targetFilePath}`);
          continue;
        }

        await this.fileSystem.rename(currentFilePath, targetFilePath);
        this.logger.info(`Media file renamed: ${fileName} -> ${targetFileName}`);
      }
    }
  }

  private findMapping(
    folderName: string,
    mappingByOriginalName: Map<string, ConversationMapping>,
    mappingByNormalizedName: Map<string, ConversationMapping>
  ): ConversationMapping | undefined {
    const withoutPrefix: string = this.nameNormalizer.removeWhatsAppPrefix(folderName);
    const byOriginal: ConversationMapping | undefined = mappingByOriginalName.get(withoutPrefix);
    if (byOriginal !== undefined) {
      return byOriginal;
    }

    return mappingByNormalizedName.get(this.nameNormalizer.normalizeForMatch(folderName));
  }

  private async renameFolderIfNeeded(
    currentFolderPath: string,
    targetFolderPath: string,
    currentFolderName: string,
    targetFolderName: string
  ): Promise<string> {
    if (currentFolderPath === targetFolderPath) {
      return currentFolderPath;
    }

    if (await this.fileSystem.exists(targetFolderPath)) {
      this.logger.warn(`Skipping media folder rename because target already exists: ${targetFolderName}`);
      return currentFolderPath;
    }

    await this.fileSystem.rename(currentFolderPath, targetFolderPath);
    this.logger.info(`Media folder renamed: ${currentFolderName} -> ${targetFolderName}`);
    return targetFolderPath;
  }
}
