import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FailedAudioResourceLogPort } from '../../../application/ports/outbound/failed-audio-resource-log.port';

@Injectable()
export class FileSystemFailedAudioResourceLogAdapter
  implements FailedAudioResourceLogPort
{
  private readonly logFilePath = resolve(
    process.cwd(),
    'output',
    'failed-audio-resource-urls.log'
  );

  public async resetLog(): Promise<void> {
    await fs.mkdir(dirname(this.logFilePath), { recursive: true });
    await fs.writeFile(this.logFilePath, '', { encoding: 'utf-8', flag: 'w' });
  }

  public async appendOriginalUrl(url: string): Promise<void> {
    await fs.mkdir(dirname(this.logFilePath), { recursive: true });
    await fs.appendFile(this.logFilePath, `${url}\n`, { encoding: 'utf-8' });
  }
}
