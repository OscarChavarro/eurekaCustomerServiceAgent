export interface AudioWaveformBarsPort {
  buildFromWavFile(wavFilePath: string, barsCount: number): number[];
}

