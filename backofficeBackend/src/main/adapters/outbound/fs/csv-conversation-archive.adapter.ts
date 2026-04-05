import { Injectable } from '@nestjs/common';
import { access, mkdir, rename } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type {
  ConversationCsvArchivePort,
  ConversationCsvArchiveResult
} from '../../../application/ports/outbound/conversation-csv-archive.port';

@Injectable()
export class CsvConversationArchiveAdapter implements ConversationCsvArchivePort {
  public async moveToDisabledFolderIfCsv(sourceFilePath: string | null): Promise<ConversationCsvArchiveResult> {
    if (!sourceFilePath) {
      return {
        moved: false,
        fromPath: null,
        toPath: null
      };
    }

    const sourceFolderPath = dirname(sourceFilePath);
    const sourceFolderName = basename(sourceFolderPath).toLowerCase();

    if (sourceFolderName !== 'csv') {
      return {
        moved: false,
        fromPath: sourceFilePath,
        toPath: null
      };
    }

    try {
      await access(sourceFilePath, fsConstants.F_OK);
    } catch {
      return {
        moved: false,
        fromPath: sourceFilePath,
        toPath: null
      };
    }

    const disabledFolderPath = join(dirname(sourceFolderPath), 'csv_disabled');
    await mkdir(disabledFolderPath, { recursive: true });

    const sourceFileName = basename(sourceFilePath);
    let targetFilePath = join(disabledFolderPath, sourceFileName);

    try {
      await access(targetFilePath, fsConstants.F_OK);
      targetFilePath = this.buildAlternativeTargetPath(disabledFolderPath, sourceFileName);
    } catch {
      // Target does not exist and can be used as-is.
    }

    await rename(sourceFilePath, targetFilePath);

    return {
      moved: true,
      fromPath: sourceFilePath,
      toPath: targetFilePath
    };
  }

  private buildAlternativeTargetPath(disabledFolderPath: string, sourceFileName: string): string {
    const extension = extname(sourceFileName);
    const fileNameWithoutExtension =
      extension.length > 0 ? sourceFileName.slice(0, -extension.length) : sourceFileName;
    const suffix = Date.now();

    return join(disabledFolderPath, `${fileNameWithoutExtension}__${suffix}${extension}`);
  }
}
