import { Injectable } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class WhisperFfmpegStartupValidator implements StartupValidator {
  public getName(): string {
    return 'WhisperFfmpegStartupValidator';
  }

  public getSuccessMessage(): string {
    return 'Whisper and ffmpeg availability check succeeded.';
  }

  public async validate(): Promise<void> {
    this.ensureCommandIsAvailable('whisper', ['--help']);
    this.ensureCommandIsAvailable('ffmpeg', ['-version']);
  }

  private ensureCommandIsAvailable(command: string, args: string[]): void {
    const execution = spawnSync(command, args, {
      encoding: 'utf-8',
      timeout: 7_000
    });

    if (!execution.error && execution.status === 0) {
      return;
    }

    const stderr = execution.stderr?.trim();
    const stdout = execution.stdout?.trim();
    const details = stderr || stdout || execution.error?.message || 'unknown error';

    throw new Error(
      `Cannot execute "${command}". Ensure it is installed and available in PATH. ${details}`
    );
  }
}

