import { Inject, Injectable } from '@nestjs/common';
import type { AudioTranscribeWorkerPoolPort } from '../../ports/outbound/audio-transcribe-worker-pool.port';
import { TOKENS } from '../../ports/tokens';
import { AudioTranscribeCommand } from './audio-transcribe.command';
import type { AudioTranscribeResult } from './audio-transcribe.result';

@Injectable()
export class AudioTranscribeUseCase {
  constructor(
    @Inject(TOKENS.AudioTranscribeWorkerPoolPort)
    private readonly audioTranscribeWorkerPoolPort: AudioTranscribeWorkerPoolPort
  ) {}

  public async execute(command: AudioTranscribeCommand): Promise<AudioTranscribeResult> {
    return this.audioTranscribeWorkerPoolPort.enqueueBlocking(command.url);
  }

  public executeAsync(
    command: AudioTranscribeCommand,
    onCompleted: (payload: AudioTranscribeResult, params: Record<string, unknown>) => void,
    params: Record<string, unknown>
  ): void {
    this.audioTranscribeWorkerPoolPort.enqueueNonBlocking(command.url, (payload) => {
      onCompleted(payload, params);
    });
  }
}
