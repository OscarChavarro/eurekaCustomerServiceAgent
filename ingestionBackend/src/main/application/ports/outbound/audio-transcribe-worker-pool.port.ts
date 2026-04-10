import type { AudioTranscribeResult } from '../../use-cases/audio-transcribe/audio-transcribe.result';

export interface AudioTranscribeWorkerPoolPort {
  enqueueBlocking(url: string): Promise<AudioTranscribeResult>;
  enqueueNonBlocking(
    url: string,
    onCompleted: (payload: AudioTranscribeResult) => void
  ): void;
}

