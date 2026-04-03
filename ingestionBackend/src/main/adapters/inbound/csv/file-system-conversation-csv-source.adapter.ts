import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { promises as fs } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import type {
  ConversationCsvSourcePort,
  ConversationCsvRawRecord
} from '../../../application/ports/inbound/conversation-csv-source.port';

@Injectable()
export class FileSystemConversationCsvSourceAdapter implements ConversationCsvSourcePort {
  public async readFromFolder(folderPath: string): Promise<ConversationCsvRawRecord[]> {
    const resolvedFolderPath = this.resolveFolderPath(folderPath);
    const folderStats = await fs.stat(resolvedFolderPath);

    if (!folderStats.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedFolderPath}`);
    }

    const folderEntries = await fs.readdir(resolvedFolderPath, { withFileTypes: true });

    const csvFiles = folderEntries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.csv')
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const rawRecords: ConversationCsvRawRecord[] = [];

    for (const csvFileName of csvFiles) {
      const csvPath = join(resolvedFolderPath, csvFileName);
      const csvContent = await fs.readFile(csvPath, 'utf-8');
      const rows = parse(csvContent, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      }) as Record<string, unknown>[];

      rows.forEach((row, rowIndex) => {
        rawRecords.push({
          sourceFile: csvFileName,
          rowNumber: rowIndex + 1,
          fields: this.normalizeFieldValues(row)
        });
      });
    }

    return rawRecords;
  }

  private resolveFolderPath(folderPath: string): string {
    if (isAbsolute(folderPath)) {
      return folderPath;
    }

    return resolve(process.cwd(), folderPath);
  }

  private normalizeFieldValues(row: Record<string, unknown>): Record<string, string> {
    const normalizedFields: Record<string, string> = {};

    Object.entries(row).forEach(([key, value]) => {
      normalizedFields[key] = this.toStringValue(value);
    });

    return normalizedFields;
  }

  private toStringValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value).trim();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return JSON.stringify(value);
  }
}
