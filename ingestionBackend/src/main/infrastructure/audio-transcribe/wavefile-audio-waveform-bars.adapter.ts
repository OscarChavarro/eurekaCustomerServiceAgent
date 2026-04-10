import { readFileSync } from 'node:fs';
import { WaveFile } from 'wavefile';
import type { AudioWaveformBarsPort } from '../../application/ports/outbound/audio-waveform-bars.port';

export class WavefileAudioWaveformBarsAdapter implements AudioWaveformBarsPort {
  public buildFromWavFile(wavFilePath: string, barsCount: number): number[] {
    if (!Number.isInteger(barsCount) || barsCount <= 0) {
      return [];
    }

    const wavBuffer = readFileSync(wavFilePath);
    const wavFile = new WaveFile(wavBuffer);
    const samples = this.toInt16Samples(wavFile.getSamples(true, Int16Array));

    if (samples.length === 0) {
      return Array.from({ length: barsCount }, () => 0);
    }

    const chunkSize = Math.max(1, Math.floor(samples.length / barsCount));
    const bars: number[] = [];

    for (let index = 0; index < barsCount; index += 1) {
      const start = index * chunkSize;
      const end = Math.min(samples.length, start + chunkSize);
      let max = 0;

      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const value = Math.abs(samples[sampleIndex] ?? 0);
        if (value > max) {
          max = value;
        }
      }

      bars.push(Math.round((max / 32768) * 100));
    }

    return bars;
  }

  private toInt16Samples(rawSamples: unknown): Int16Array {
    if (rawSamples instanceof Int16Array) {
      return rawSamples;
    }

    if (Array.isArray(rawSamples)) {
      const flattened = rawSamples.flatMap((channelSamples) => {
        if (channelSamples instanceof Int16Array) {
          return Array.from(channelSamples);
        }

        if (Array.isArray(channelSamples)) {
          return channelSamples.map((value) =>
            typeof value === 'number' && Number.isFinite(value) ? value : 0
          );
        }

        return [];
      });

      return Int16Array.from(flattened);
    }

    return new Int16Array();
  }
}

