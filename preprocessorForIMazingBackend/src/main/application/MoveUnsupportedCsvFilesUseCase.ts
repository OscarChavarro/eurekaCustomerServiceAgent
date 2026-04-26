import * as path from 'path';

import { FileSystemPort, LoggerPort } from './ports';

export type MoveUnsupportedCsvFilesResult = {
  movedCsvFiles: string[];
};

export class MoveUnsupportedCsvFilesUseCase {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly logger: LoggerPort
  ) {}

  async execute(
    rootFolderPath: string,
    csvFolderPath: string,
    unsupportedCsvFiles: string[]
  ): Promise<MoveUnsupportedCsvFilesResult> {
    const unsupportedFolderPath = path.join(rootFolderPath, 'csv_unsupported');
    const movedCsvFiles: string[] = [];

    for (const csvFileName of unsupportedCsvFiles) {
      const currentPath = path.join(csvFolderPath, csvFileName);
      const currentExists = await this.fileSystem.exists(currentPath);
      if (!currentExists) {
        this.logger.warn(`Skipping unsupported CSV move because source does not exist: ${csvFileName}`);
        continue;
      }

      const targetPath = path.join(unsupportedFolderPath, csvFileName);
      const targetExists = await this.fileSystem.exists(targetPath);
      if (targetExists) {
        this.logger.warn(`Skipping unsupported CSV move because target already exists: csv_unsupported/${csvFileName}`);
        continue;
      }

      await this.fileSystem.rename(currentPath, targetPath);
      this.logger.info(`Unsupported CSV moved: ${csvFileName} -> csv_unsupported/${csvFileName}`);
      movedCsvFiles.push(csvFileName);
    }

    return { movedCsvFiles };
  }
}
