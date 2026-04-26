import { Injectable } from '@nestjs/common';
import { CsvRecord } from '../../../domain/Conversation';
import { CsvParserPort } from '../../../application/ports';

@Injectable()
export class SimpleCsvParser implements CsvParserPort {
  parse(content: string): CsvRecord[] {
    const rows: string[][] = this.parseRows(content);
    if (rows.length === 0) {
      return [];
    }

    const headers: string[] = rows[0].map((value: string) => value.trim());
    const records: CsvRecord[] = [];

    for (let index: number = 1; index < rows.length; index += 1) {
      const row: string[] = rows[index];
      if (row.every((value: string) => value.trim() === '')) {
        continue;
      }

      const record: CsvRecord = {};
      for (let headerIndex: number = 0; headerIndex < headers.length; headerIndex += 1) {
        record[headers[headerIndex]] = row[headerIndex] !== undefined ? row[headerIndex] : '';
      }
      records.push(record);
    }

    return records;
  }

  private parseRows(content: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue: string = '';
    let insideQuotes: boolean = false;

    for (let index: number = 0; index < content.length; index += 1) {
      const currentChar: string = content[index];
      const nextChar: string = index + 1 < content.length ? content[index + 1] : '';

      if (currentChar === '"') {
        if (insideQuotes && nextChar === '"') {
          currentValue += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (currentChar === ',' && !insideQuotes) {
        currentRow.push(currentValue);
        currentValue = '';
        continue;
      }

      if ((currentChar === '\n' || currentChar === '\r') && !insideQuotes) {
        if (currentChar === '\r' && nextChar === '\n') {
          index += 1;
        }
        currentRow.push(currentValue);
        rows.push(currentRow);
        currentRow = [];
        currentValue = '';
        continue;
      }

      currentValue += currentChar;
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue);
      rows.push(currentRow);
    }

    return rows;
  }
}
