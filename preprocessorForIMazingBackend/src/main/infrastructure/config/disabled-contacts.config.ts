import { readFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

@Injectable()
export class DisabledContactsConfig {
  async load(): Promise<string[]> {
    const configPath = join(process.cwd(), 'etc', 'disabledContacts.json');

    let raw: string;
    try {
      raw = await readFile(configPath, 'utf-8');
    } catch {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in ${configPath}.`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid configuration in ${configPath}. Expected an array of strings.`);
    }

    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
}
