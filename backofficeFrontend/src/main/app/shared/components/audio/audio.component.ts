import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  HostListener,
  OnDestroy,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';

import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';
import type { ChatMessageDirection } from '../../../shell/services/view-stages/conversation-view.types';

type TriedResourceLink = {
  encoded: string;
  decoded: string;
};

@Component({
  selector: 'app-audio',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audio.component.html',
  styleUrl: './audio.component.sass'
})
export class AudioComponent implements AfterViewInit, OnDestroy {
  private static readonly DEFAULT_DISPLAY_WAVE_BARS_COUNT = 64;
  private static readonly MIN_DISPLAY_WAVE_BARS_COUNT = 36;
  private static readonly MAX_DISPLAY_WAVE_BARS_COUNT = 320;
  // Keep these in sync with .wave-bar width and .audio-waveform gap in SASS.
  private static readonly WAVE_BAR_WIDTH_PX = 3;
  private static readonly WAVE_BAR_GAP_PX = 5;
  private static readonly WAVE_BAR_MIN_HEIGHT_PX = 4;
  private static readonly WAVE_BAR_MAX_HEIGHT_PX = 22;
  public readonly messageId = input<string>('');
  public readonly direction = input<ChatMessageDirection>('incoming');
  public readonly resourceUrl = input<string | undefined>(undefined);
  public readonly waveBars = input<number[] | undefined>(undefined);
  public readonly transcription = input<string | undefined>(undefined);
  public readonly transcriptionLabel = input<string>('AI transcription:');
  public readonly playbackEnded = output<void>();
  protected readonly I18N_KEYS = I18N_KEYS;
  protected readonly speedOptions = ['0.5x', '1x', '1.5x', '2x'] as const;
  protected readonly speedIndex = signal<number>(1);
  protected readonly isPlaying = signal<boolean>(false);
  protected readonly currentTimeSeconds = signal<number>(0);
  protected readonly totalTimeSeconds = signal<number>(0);
  protected readonly resourceCheckStatus = signal<'idle' | 'available' | 'missing'>('idle');
  protected readonly errorTooltipOpen = signal<boolean>(false);
  protected readonly copyFeedbackVisible = signal<boolean>(false);
  protected readonly failedResourceUrlEncoded = signal<string | null>(null);
  protected readonly attemptedResourceUrlsEncoded = signal<string[]>([]);
  protected readonly failedResourceUrlDecoded = computed(() =>
    this.decodeHttpUrl(this.failedResourceUrlEncoded())
  );
  protected readonly hasPlayableResource = computed(() => {
    if (this.hasMissingResource()) {
      return false;
    }

    return this.resolveCandidateUrl() !== null;
  });
  protected readonly hasMissingResource = computed(() => this.resourceCheckStatus() === 'missing');
  protected readonly attemptedResourceLinks = computed<TriedResourceLink[]>(() =>
    this.attemptedResourceUrlsEncoded().map((encoded) => ({
      encoded,
      decoded: this.decodeHttpUrl(encoded)
    }))
  );
  protected readonly currentTimeLabel = computed(() =>
    this.formatTimeLabel(this.currentTimeSeconds())
  );
  protected readonly totalTimeLabel = computed(() =>
    this.formatTimeLabel(this.totalTimeSeconds())
  );
  protected readonly normalizedWaveBars = computed(() =>
    this.buildWaveBarsForDisplay(
      this.waveBars(),
      this.resolveDisplayWaveBarsCount(this.waveformWidthPx()),
      AudioComponent.WAVE_BAR_MIN_HEIGHT_PX,
      AudioComponent.WAVE_BAR_MAX_HEIGHT_PX
    )
  );
  protected readonly displayTranscription = computed(() => {
    const value = this.transcription()?.trim();
    return value && value.length > 0 ? value : null;
  });
  protected readonly progressPercent = computed(() => {
    const total = this.totalTimeSeconds();
    if (total <= 0) {
      return 0;
    }

    const progress = (this.currentTimeSeconds() / total) * 100;
    return Math.max(0, Math.min(100, progress));
  });
  protected readonly isSeeking = signal<boolean>(false);
  @ViewChild('waveformTrack')
  private waveformTrackElement: ElementRef<HTMLDivElement> | null = null;
  private readonly waveformWidthPx = signal<number>(0);

  private audioElement: HTMLAudioElement | null = null;
  private progressAnimationFrameId: number | null = null;
  private copyFeedbackTimeoutId: number | null = null;
  private pendingSeekPercent: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly onLoadedMetadata = (): void => {
    const audio = this.audioElement;
    if (!audio || !Number.isFinite(audio.duration)) {
      return;
    }

    this.totalTimeSeconds.set(audio.duration);
    if (this.pendingSeekPercent !== null) {
      this.seekToPercent(this.pendingSeekPercent);
      this.pendingSeekPercent = null;
    }
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
        this.attemptedResourceUrlsEncoded.set([]);
        this.resetPlaybackState();
        this.destroyAudioElement();
        return;
      }

      this.resourceCheckStatus.set('available');
      this.failedResourceUrlEncoded.set(null);
      this.attemptedResourceUrlsEncoded.set([candidateUrl]);
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

  protected onWaveformPointerDown(event: PointerEvent): void {
    if (!this.hasPlayableResource()) {
      return;
    }

    const waveformElement = this.waveformTrackElement?.nativeElement;
    if (!waveformElement) {
      return;
    }

    event.preventDefault();
    this.isSeeking.set(true);
    this.seekFromPointer(event.clientX, waveformElement);
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

  @HostListener('document:pointermove', ['$event'])
  protected onDocumentPointerMove(event: PointerEvent): void {
    if (!this.isSeeking()) {
      return;
    }

    const waveformElement = this.waveformTrackElement?.nativeElement;
    if (!waveformElement) {
      return;
    }

    event.preventDefault();
    this.seekFromPointer(event.clientX, waveformElement);
  }

  @HostListener('document:pointerup')
  protected onDocumentPointerUp(): void {
    if (!this.isSeeking()) {
      return;
    }

    this.isSeeking.set(false);
  }

  ngOnDestroy(): void {
    this.clearCopyFeedbackTimeout();
    this.isSeeking.set(false);
    this.disconnectWaveformResizeObserver();
    this.destroyAudioElement();
  }

  ngAfterViewInit(): void {
    this.setupWaveformResizeObserver();
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
    if (this.resourceCheckStatus() === 'missing') {
      return null;
    }

    return this.resolveCandidateUrl();
  }

  private resolveCandidateUrl(): string | null {
    const resourceUrl = this.resourceUrl()?.trim();
    if (!resourceUrl) {
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

  private seekFromPointer(clientX: number, waveformElement: HTMLDivElement): void {
    const rect = waveformElement.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percent = (relativeX / rect.width) * 100;
    this.seekToPercent(percent);
  }

  private seekToPercent(percent: number): void {
    const safePercent = Math.max(0, Math.min(100, percent));
    const audio = this.getOrCreateAudioElement();
    if (!audio) {
      return;
    }

    const duration = Number.isFinite(audio.duration) ? audio.duration : this.totalTimeSeconds();
    if (!Number.isFinite(duration) || duration <= 0) {
      this.pendingSeekPercent = safePercent;
      return;
    }

    const targetTime = (safePercent / 100) * duration;
    audio.currentTime = targetTime;
    this.currentTimeSeconds.set(targetTime);
    this.totalTimeSeconds.set(duration);
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

  protected t(key: (typeof I18N_KEYS)['shell'][keyof (typeof I18N_KEYS)['shell']]): string {
    return this.i18nService.get(key, this.i18nStateService.selectedLanguage());
  }

  private setupWaveformResizeObserver(): void {
    this.disconnectWaveformResizeObserver();

    const waveformElement = this.waveformTrackElement?.nativeElement;
    if (!waveformElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.waveformWidthPx.set(waveformElement.clientWidth);
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const width = entry.contentRect?.width ?? waveformElement.clientWidth;
      this.waveformWidthPx.set(width);
    });
    this.resizeObserver.observe(waveformElement);
  }

  private disconnectWaveformResizeObserver(): void {
    if (!this.resizeObserver) {
      return;
    }

    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }

  private resolveDisplayWaveBarsCount(waveformWidthPx: number): number {
    if (!Number.isFinite(waveformWidthPx) || waveformWidthPx <= 0) {
      return AudioComponent.DEFAULT_DISPLAY_WAVE_BARS_COUNT;
    }

    const fullStepPx = AudioComponent.WAVE_BAR_WIDTH_PX + AudioComponent.WAVE_BAR_GAP_PX;
    const estimatedCount = Math.floor((waveformWidthPx + AudioComponent.WAVE_BAR_GAP_PX) / fullStepPx);

    return Math.max(
      AudioComponent.MIN_DISPLAY_WAVE_BARS_COUNT,
      Math.min(AudioComponent.MAX_DISPLAY_WAVE_BARS_COUNT, estimatedCount)
    );
  }

  private buildWaveBarsForDisplay(
    sourceBars: number[] | undefined,
    targetCount: number,
    minHeightPx: number,
    maxHeightPx: number
  ): number[] {
    const fallbackBarHeightPx = 8;
    const fallbackBars = Array.from({ length: targetCount }, () => fallbackBarHeightPx);

    if (!Array.isArray(sourceBars)) {
      return fallbackBars;
    }

    const numericBars = sourceBars.filter((bar): bar is number => Number.isFinite(bar));
    const maxBarValue = numericBars.reduce((max, value) => Math.max(max, value), 0);
    const unitScale = maxBarValue <= 1.5 ? 100 : 1;
    const normalized = numericBars.map((bar) => Math.max(0, Math.min(100, bar * unitScale)));

    if (normalized.length === 0) {
      return fallbackBars;
    }

    if (normalized.length === targetCount) {
      return normalized.map((bar) => this.toWaveHeightPixels(bar, minHeightPx, maxHeightPx));
    }

    const result: number[] = [];
    const lastSourceIndex = normalized.length - 1;
    const lastTargetIndex = targetCount - 1;

    for (let index = 0; index < targetCount; index += 1) {
      const sourcePosition = lastTargetIndex > 0
        ? (index / lastTargetIndex) * lastSourceIndex
        : 0;
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.min(lastSourceIndex, Math.ceil(sourcePosition));
      const interpolationFactor = sourcePosition - leftIndex;
      const leftValue = normalized[leftIndex] ?? 0;
      const rightValue = normalized[rightIndex] ?? leftValue;
      const interpolated = leftValue + (rightValue - leftValue) * interpolationFactor;
      result.push(this.toWaveHeightPixels(interpolated, minHeightPx, maxHeightPx));
    }

    return result;
  }

  private toWaveHeightPixels(value: number, minHeightPx: number, maxHeightPx: number): number {
    const bounded = Math.max(0, Math.min(100, value));
    return Math.round(minHeightPx + ((maxHeightPx - minHeightPx) * bounded) / 100);
  }
}
