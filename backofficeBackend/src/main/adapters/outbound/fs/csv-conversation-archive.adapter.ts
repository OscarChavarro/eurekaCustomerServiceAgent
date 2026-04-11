import { Injectable } from '@nestjs/common';
import { access, mkdir, rename, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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
    const targetFilePath = join(disabledFolderPath, sourceFileName);
    await this.deleteFileIfExists(targetFilePath);

    await rename(sourceFilePath, targetFilePath);

    return {
      moved: true,
      fromPath: sourceFilePath,
      toPath: targetFilePath
    };
  }

  private async deleteFileIfExists(filePath: string): Promise<void> {
    try {
      await access(filePath, fsConstants.F_OK);
    } catch {
      return;
    }

    await unlink(filePath);
  }
}
