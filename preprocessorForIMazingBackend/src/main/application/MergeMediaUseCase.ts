import { Inject, Injectable } from '@nestjs/common';
import * as path from 'path';
import { FileSystemPort } from './ports';
import { TOKENS } from './ports/tokens';

export type MergeMediaResult = {
  status: 'ok' | 'error';
  message: string;
  sourceDiffPath: string;
  targetMergedPath: string;
  outputPath: string;
  logs: {
    movedFilesLog: string;
    preExistingFilesLog: string;
    conflictingFilesLog: string;
  };
  counts: {
    moved: number;
    preExisting: number;
    conflicting: number;
  };
};

export class MergeMediaInputValidationError extends Error {
  readonly missingDirectoryPath: string;

  constructor(missingDirectoryPath: string) {
    super(`Directory does not exist: ${missingDirectoryPath}`);
    this.missingDirectoryPath = missingDirectoryPath;
  }
}

@Injectable()
export class MergeMediaUseCase {
  constructor(
    @Inject(TOKENS.FileSystemPort)
    private readonly fileSystem: FileSystemPort
  ) {}

  async execute(sourceDiffPath: string, targetMergedPath: string): Promise<MergeMediaResult> {
    const resolvedSourceDiffPath = await this.resolveExistingDirectoryPath(sourceDiffPath);
    const resolvedTargetMergedPath = this.resolveMergeMediaInputPath(targetMergedPath);
    const outputPath = path.resolve(process.cwd(), 'output');

    const logs = {
      movedFilesLog: path.join(outputPath, 'moved-files.log'),
      preExistingFilesLog: path.join(outputPath, 'pre-existing-files.log'),
      conflictingFilesLog: path.join(outputPath, 'conflicting-files.log')
    };

    await this.fileSystem.ensureDirectory(outputPath);
    await this.initializeLogs(logs);

    const sourceExists = await this.fileSystem.exists(resolvedSourceDiffPath);
    if (!sourceExists) {
      throw new MergeMediaInputValidationError(resolvedSourceDiffPath);
    }

    await this.fileSystem.ensureDirectory(resolvedTargetMergedPath);

    const sourceFiles = await this.fileSystem.listFilesRecursively(resolvedSourceDiffPath);
    const moved: string[] = [];
    const preExisting: string[] = [];
    const conflicting: string[] = [];

    for (const sourceFilePath of sourceFiles) {
      const relativePath = path.relative(resolvedSourceDiffPath, sourceFilePath);
      const targetFilePath = path.join(resolvedTargetMergedPath, relativePath);
      const targetFileExists = await this.fileSystem.exists(targetFilePath);

      if (!targetFileExists) {
        await this.fileSystem.ensureDirectory(path.dirname(targetFilePath));
        await this.fileSystem.rename(sourceFilePath, targetFilePath);
        moved.push(relativePath);
        continue;
      }

      const areEqual = await this.fileSystem.areFilesEqual(sourceFilePath, targetFilePath);
      if (areEqual) {
        await this.fileSystem.deleteFile(sourceFilePath);
        preExisting.push(relativePath);
        continue;
      }

      conflicting.push(relativePath);
    }

    await this.writeLog(logs.movedFilesLog, moved);
    await this.writeLog(logs.preExistingFilesLog, preExisting);
    await this.writeLog(logs.conflictingFilesLog, conflicting);
    await this.fileSystem.removeEmptyDirectoriesRecursively(resolvedSourceDiffPath);

    return {
      status: 'ok',
      message: 'Merge media process completed.',
      sourceDiffPath: resolvedSourceDiffPath,
      targetMergedPath: resolvedTargetMergedPath,
      outputPath,
      logs,
      counts: {
        moved: moved.length,
        preExisting: preExisting.length,
        conflicting: conflicting.length
      }
    };
  }

  buildMissingDirectoryResult(
    sourceDiffPath: string,
    targetMergedPath: string,
    missingDirectoryPath: string
  ): MergeMediaResult {
    const outputPath = path.resolve(process.cwd(), 'output');
    return {
      status: 'error',
      message: `Directory does not exist: ${missingDirectoryPath}`,
      sourceDiffPath: this.resolveMergeMediaInputPath(sourceDiffPath),
      targetMergedPath: this.resolveMergeMediaInputPath(targetMergedPath),
      outputPath,
      logs: {
        movedFilesLog: path.join(outputPath, 'moved-files.log'),
        preExistingFilesLog: path.join(outputPath, 'pre-existing-files.log'),
        conflictingFilesLog: path.join(outputPath, 'conflicting-files.log')
      },
      counts: {
        moved: 0,
        preExisting: 0,
        conflicting: 0
      }
    };
  }

  buildUnexpectedErrorResult(sourceDiffPath: string, targetMergedPath: string, error: unknown): MergeMediaResult {
    const outputPath = path.resolve(process.cwd(), 'output');
    return {
      status: 'error',
      message: `Unexpected error during merge media process: ${error instanceof Error ? error.message : String(error)}`,
      sourceDiffPath: this.resolveMergeMediaInputPath(sourceDiffPath),
      targetMergedPath: this.resolveMergeMediaInputPath(targetMergedPath),
      outputPath,
      logs: {
        movedFilesLog: path.join(outputPath, 'moved-files.log'),
        preExistingFilesLog: path.join(outputPath, 'pre-existing-files.log'),
        conflictingFilesLog: path.join(outputPath, 'conflicting-files.log')
      },
      counts: {
        moved: 0,
        preExisting: 0,
        conflicting: 0
      }
    };
  }

  private async initializeLogs(logs: MergeMediaResult['logs']): Promise<void> {
    await this.fileSystem.writeTextFile(logs.movedFilesLog, 'No moved files.\n');
    await this.fileSystem.writeTextFile(logs.preExistingFilesLog, 'No pre-existing identical files.\n');
    await this.fileSystem.writeTextFile(logs.conflictingFilesLog, 'No conflicting files.\n');
  }

  private async writeLog(logPath: string, entries: string[]): Promise<void> {
    const content = entries.length === 0 ? 'No files in this group.\n' : `${entries.join('\n')}\n`;
    await this.fileSystem.writeTextFile(logPath, content);
  }

  private resolveMergeMediaInputPath(inputPath: string): string {
    return inputPath.trim();
  }

  private async resolveExistingDirectoryPath(inputPath: string): Promise<string> {
    return this.resolveMergeMediaInputPath(inputPath);
  }
}
