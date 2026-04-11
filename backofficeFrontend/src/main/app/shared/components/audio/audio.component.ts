import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal
} from '@angular/core';

import type { ChatMessageDirection } from '../../../shell/services/view-stages/conversation-view.types';

@Component({
  selector: 'app-audio',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audio.component.html',
  styleUrl: './audio.component.sass'
})
export class AudioComponent implements OnDestroy {
  private static readonly RESOURCE_HEAD_TIMEOUT_MS = 4_500;
  public readonly messageId = input<string>('');
  public readonly direction = input<ChatMessageDirection>('incoming');
  public readonly resourceUrl = input<string | undefined>(undefined);
  public readonly playbackEnded = output<void>();
  protected readonly waveformBars = Array.from({ length: 64 }, (_, index) => index);
  protected readonly speedOptions = ['0.5x', '1x', '1.5x', '2x'] as const;
  protected readonly speedIndex = signal<number>(1);
  protected readonly isPlaying = signal<boolean>(false);
  protected readonly currentTimeSeconds = signal<number>(0);
  protected readonly totalTimeSeconds = signal<number>(0);
  protected readonly resourceCheckStatus = signal<'idle' | 'checking' | 'available' | 'missing'>('idle');
  protected readonly errorTooltipOpen = signal<boolean>(false);
  protected readonly copyFeedbackVisible = signal<boolean>(false);
  protected readonly failedResourceUrlEncoded = signal<string | null>(null);
  protected readonly failedResourceUrlDecoded = computed(() =>
    this.decodeHttpUrl(this.failedResourceUrlEncoded())
  );
  protected readonly hasPlayableResource = computed(() => this.resolvePlayableUrl() !== null);
  protected readonly hasMissingResource = computed(() => this.resourceCheckStatus() === 'missing');
  protected readonly currentTimeLabel = computed(() =>
    this.formatTimeLabel(this.currentTimeSeconds())
  );
  protected readonly totalTimeLabel = computed(() =>
    this.formatTimeLabel(this.totalTimeSeconds())
  );
  protected readonly progressPercent = computed(() => {
    const total = this.totalTimeSeconds();
    if (total <= 0) {
      return 0;
    }

    const progress = (this.currentTimeSeconds() / total) * 100;
    return Math.max(0, Math.min(100, progress));
  });

  private audioElement: HTMLAudioElement | null = null;
  private progressAnimationFrameId: number | null = null;
  private resourceCheckRequestId = 0;
  private copyFeedbackTimeoutId: number | null = null;
  private readonly onLoadedMetadata = (): void => {
    const audio = this.audioElement;
    if (!audio || !Number.isFinite(audio.duration)) {
      return;
    }

    this.totalTimeSeconds.set(audio.duration);
  };
  private readonly onDurationChange = (): void => {
    const audio = this.audioElement;
    if (!audio || !Number.isFinite(audio.duration)) {
      return;
    }

    this.totalTimeSeconds.set(audio.duration);
  };
  private readonly onTimeUpdate = (): void => {
    const audio = this.audioElement;
    if (!audio) {
      return;
    }

    this.currentTimeSeconds.set(audio.currentTime);
  };
  private readonly onPlay = (): void => {
    this.isPlaying.set(true);
    this.startProgressAnimation();
  };
  private readonly onPause = (): void => {
    this.isPlaying.set(false);
    this.stopProgressAnimation();
  };
  private readonly onEnded = (): void => {
    const total = this.totalTimeSeconds();
    this.currentTimeSeconds.set(total > 0 ? total : 0);
    this.isPlaying.set(false);
    this.stopProgressAnimation();
    this.playbackEnded.emit();
  };
  private readonly onError = (): void => {
    this.isPlaying.set(false);
    this.stopProgressAnimation();
  };

  constructor() {
    effect(() => {
      const candidateUrl = this.resolveCandidateUrl();

      this.errorTooltipOpen.set(false);
      this.copyFeedbackVisible.set(false);

      if (!candidateUrl) {
        this.resourceCheckStatus.set('idle');
        this.failedResourceUrlEncoded.set(null);
        this.resetPlaybackState();
        this.destroyAudioElement();
        return;
      }

      this.resourceCheckStatus.set('checking');
      this.failedResourceUrlEncoded.set(null);
      void this.checkResourceAvailability(candidateUrl);
    });

    effect(() => {
      const url = this.resolvePlayableUrl();

      if (!url) {
        this.resetPlaybackState();
        this.destroyAudioElement();
        return;
      }

      const audio = this.audioElement;
      if (!audio) {
        return;
      }

      if (audio.src !== url) {
        this.resetPlaybackState();
        audio.src = url;
        audio.load();
      }
    });
  }

  protected toggleSpeed(): void {
    this.speedIndex.update((index) => {
      const nextIndex = (index + 1) % this.speedOptions.length;
      const audio = this.audioElement;
      if (audio) {
        audio.playbackRate = this.speedLabelToNumber(this.speedOptions[nextIndex]);
      }
      return nextIndex;
    });
  }

  protected activeSpeedLabel(): (typeof this.speedOptions)[number] {
    return this.speedOptions[this.speedIndex()];
  }

  protected async togglePlayback(): Promise<void> {
    if (this.hasMissingResource()) {
      this.toggleErrorTooltip();
      return;
    }

    const audio = this.getOrCreateAudioElement();
    if (!audio) {
      return;
    }

    if (audio.paused) {
      await this.playAudio(audio);
      return;
    }

    audio.pause();
  }

  public playFromAutoAdvance(): void {
    if (this.hasMissingResource()) {
      return;
    }

    const audio = this.getOrCreateAudioElement();
    if (!audio || !audio.paused) {
      return;
    }

    void this.playAudio(audio);
  }

  protected normalizedProgressPercent(): number {
    return this.progressPercent();
  }

  protected toggleErrorTooltip(): void {
    if (!this.hasMissingResource()) {
      return;
    }

    this.errorTooltipOpen.update((value) => !value);
  }

  protected async copyFailedUrlToClipboard(): Promise<void> {
    const failedUrl = this.failedResourceUrlEncoded();
    if (!failedUrl || !navigator?.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(failedUrl);
      this.copyFeedbackVisible.set(true);
      this.clearCopyFeedbackTimeout();
      this.copyFeedbackTimeoutId = window.setTimeout(() => {
        this.copyFeedbackVisible.set(false);
        this.copyFeedbackTimeoutId = null;
      }, 1300);
    } catch {
      this.copyFeedbackVisible.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscapePressed(): void {
    if (!this.errorTooltipOpen()) {
      return;
    }

    this.errorTooltipOpen.set(false);
  }

  ngOnDestroy(): void {
    this.clearCopyFeedbackTimeout();
    this.destroyAudioElement();
  }

  private getOrCreateAudioElement(): HTMLAudioElement | null {
    const url = this.resolvePlayableUrl();
    if (!url) {
      return null;
    }

    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = 'metadata';
      this.audioElement.addEventListener('loadedmetadata', this.onLoadedMetadata);
      this.audioElement.addEventListener('durationchange', this.onDurationChange);
      this.audioElement.addEventListener('timeupdate', this.onTimeUpdate);
      this.audioElement.addEventListener('play', this.onPlay);
      this.audioElement.addEventListener('pause', this.onPause);
      this.audioElement.addEventListener('ended', this.onEnded);
      this.audioElement.addEventListener('error', this.onError);
    }

    if (this.audioElement.src !== url) {
      this.resetPlaybackState();
      this.audioElement.src = url;
      this.audioElement.currentTime = 0;
      this.audioElement.playbackRate = this.speedLabelToNumber(this.activeSpeedLabel());
      this.audioElement.load();
    }

    return this.audioElement;
  }

  private destroyAudioElement(): void {
    const audio = this.audioElement;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    audio.removeEventListener('durationchange', this.onDurationChange);
    audio.removeEventListener('timeupdate', this.onTimeUpdate);
    audio.removeEventListener('play', this.onPlay);
    audio.removeEventListener('pause', this.onPause);
    audio.removeEventListener('ended', this.onEnded);
    audio.removeEventListener('error', this.onError);
    audio.src = '';
    this.audioElement = null;
    this.stopProgressAnimation();
  }

  private resolvePlayableUrl(): string | null {
    if (this.resourceCheckStatus() !== 'available') {
      return null;
    }

    return this.resolveCandidateUrl();
  }

  private resolveCandidateUrl(): string | null {
    const resourceUrl = this.resourceUrl()?.trim();
    if (!resourceUrl || !/\.(opus|m4a|mp3)(?:$|[?#])/i.test(resourceUrl)) {
      return null;
    }

    return resourceUrl;
  }

  private speedLabelToNumber(label: (typeof this.speedOptions)[number]): number {
    if (label === '0.5x') {
      return 0.5;
    }
    if (label === '1x') {
      return 1;
    }
    if (label === '1.5x') {
      return 1.5;
    }
    return 2;
  }

  private async playAudio(audio: HTMLAudioElement): Promise<void> {
    try {
      await audio.play();
    } catch {
      this.isPlaying.set(false);
    }
  }

  private formatTimeLabel(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
      return '0:00';
    }

    const wholeSeconds = Math.floor(totalSeconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const seconds = wholeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  private resetPlaybackState(): void {
    this.isPlaying.set(false);
    this.currentTimeSeconds.set(0);
    this.totalTimeSeconds.set(0);
    this.stopProgressAnimation();
  }

  private startProgressAnimation(): void {
    this.stopProgressAnimation();

    const tick = (): void => {
      const audio = this.audioElement;
      if (!audio) {
        this.progressAnimationFrameId = null;
        return;
      }

      this.currentTimeSeconds.set(audio.currentTime);
      if (Number.isFinite(audio.duration)) {
        this.totalTimeSeconds.set(audio.duration);
      }

      if (!audio.paused && !audio.ended) {
        this.progressAnimationFrameId = requestAnimationFrame(tick);
        return;
      }

      this.progressAnimationFrameId = null;
    };

    this.progressAnimationFrameId = requestAnimationFrame(tick);
  }

  private stopProgressAnimation(): void {
    if (this.progressAnimationFrameId === null) {
      return;
    }

    cancelAnimationFrame(this.progressAnimationFrameId);
    this.progressAnimationFrameId = null;
  }

  private async checkResourceAvailability(url: string): Promise<void> {
    const requestId = ++this.resourceCheckRequestId;

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(AudioComponent.RESOURCE_HEAD_TIMEOUT_MS)
      });

      if (requestId !== this.resourceCheckRequestId) {
        return;
      }

      if (response.status === 200) {
        this.resourceCheckStatus.set('available');
        this.failedResourceUrlEncoded.set(null);
        return;
      }

      if (response.status === 404) {
        this.resourceCheckStatus.set('missing');
        this.failedResourceUrlEncoded.set(url);
        return;
      }

      this.resourceCheckStatus.set('available');
      this.failedResourceUrlEncoded.set(null);
    } catch (error) {
      if (requestId !== this.resourceCheckRequestId) {
        return;
      }

      if (this.isTimeoutError(error)) {
        this.resourceCheckStatus.set('missing');
        this.failedResourceUrlEncoded.set(url);
        return;
      }

      this.resourceCheckStatus.set('available');
      this.failedResourceUrlEncoded.set(null);
    }
  }

  private isTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const errorName = 'name' in error ? String(error.name) : '';
    return errorName === 'TimeoutError' || errorName === 'AbortError';
  }

  private decodeHttpUrl(url: string | null): string {
    if (!url) {
      return '';
    }

    try {
      return decodeURI(url);
    } catch {
      return url;
    }
  }

  private clearCopyFeedbackTimeout(): void {
    if (this.copyFeedbackTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.copyFeedbackTimeoutId);
    this.copyFeedbackTimeoutId = null;
  }
}
