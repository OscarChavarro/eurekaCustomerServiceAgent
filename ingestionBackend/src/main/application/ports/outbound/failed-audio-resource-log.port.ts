export interface FailedAudioResourceLogPort {
  resetLog(): Promise<void>;
  appendOriginalUrl(url: string): Promise<void>;
}
