import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FailedAudioResourceLogPort } from '../../../application/ports/outbound/failed-audio-resource-log.port';

@Injectable()
export class FileSystemFailedAudioResourceLogAdapter
  implements FailedAudioResourceLogPort
{
  private readonly encodedLogFilePath = resolve(
    process.cwd(),
    'output',
    'failed-audio-resource-encoded-urls.log'
  );

  private readonly decodedLogFilePath = resolve(
    process.cwd(),
    'output',
    'failed-audio-resource-decoded-urls.log'
  );

  public async resetLog(): Promise<void> {
    await fs.mkdir(dirname(this.encodedLogFilePath), { recursive: true });
    await Promise.all([
      fs.writeFile(this.encodedLogFilePath, '', { encoding: 'utf-8', flag: 'w' }),
      fs.writeFile(this.decodedLogFilePath, '', { encoding: 'utf-8', flag: 'w' })
    ]);
  }

  public async appendOriginalUrl(url: string): Promise<void> {
    await fs.mkdir(dirname(this.encodedLogFilePath), { recursive: true });
    const decodedUrl = this.decodeUrlSafely(url);
    await Promise.all([
      fs.appendFile(this.encodedLogFilePath, `${url}\n`, { encoding: 'utf-8' }),
      fs.appendFile(this.decodedLogFilePath, `${decodedUrl}\n`, { encoding: 'utf-8' })
    ]);
  }

  private decodeUrlSafely(url: string): string {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  }
}
