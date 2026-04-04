import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { promises as fs } from 'node:fs';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import type {
  ConversationCsvSourcePort,
  ConversationCsvRawRecord
} from '../../../application/ports/inbound/conversation-csv-source.port';

@Injectable()
export class FileSystemConversationCsvSourceAdapter implements ConversationCsvSourcePort {
  public async readFromPath(path: string): Promise<ConversationCsvRawRecord[]> {
    const resolvedPath = this.resolveInputPath(path);
    const pathStats = await fs.stat(resolvedPath);
    const rawRecords: ConversationCsvRawRecord[] = [];

    if (pathStats.isFile()) {
      if (extname(resolvedPath).toLowerCase() !== '.csv') {
        throw new Error(`Path is a file but not a CSV file: ${resolvedPath}`);
      }

      const csvRecords = await this.readCsvFile(resolvedPath, basename(resolvedPath));
      rawRecords.push(...csvRecords);
      return rawRecords;
    }

    if (!pathStats.isDirectory()) {
      throw new Error(`Path must be a CSV file or a directory: ${resolvedPath}`);
    }

    const folderEntries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const csvFileNames = folderEntries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.csv')
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    for (const csvFileName of csvFileNames) {
      const csvPath = join(resolvedPath, csvFileName);
      const csvRecords = await this.readCsvFile(csvPath, csvFileName);
      rawRecords.push(...csvRecords);
    }

    return rawRecords;
  }

  private async readCsvFile(
    csvPath: string,
    sourceFile: string
  ): Promise<ConversationCsvRawRecord[]> {
    const csvContent = await fs.readFile(csvPath, 'utf-8');
    const rows = parse(csvContent, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    }) as Record<string, unknown>[];

    return rows.map((row, rowIndex) => ({
      sourceFile,
      rowNumber: rowIndex + 1,
      fields: this.normalizeFieldValues(row)
    }));
  }

  private resolveInputPath(path: string): string {
    if (isAbsolute(path)) {
      return path;
    }

    return resolve(process.cwd(), path);
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
