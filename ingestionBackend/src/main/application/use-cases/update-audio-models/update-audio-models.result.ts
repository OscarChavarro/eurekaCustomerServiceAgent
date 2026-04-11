export class UpdateAudioModelsResult {
  constructor(
    public readonly scannedAudioRawMessages: number,
    public readonly alreadyVoiceMessages: number,
    public readonly pendingAudioModelRefreshMessages: number,
    public readonly queuedAudioModelRefreshJobs: number
  ) {}
}
