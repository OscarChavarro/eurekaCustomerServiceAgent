export type AudioTranscriptionType = 'empty' | 'voice' | 'noise' | 'music';

export type AudioTranscribeResult = {
  type: AudioTranscriptionType;
  transcription: string;
  totalTimeInSeconds: number;
  language: string;
  bars: number[];
};

