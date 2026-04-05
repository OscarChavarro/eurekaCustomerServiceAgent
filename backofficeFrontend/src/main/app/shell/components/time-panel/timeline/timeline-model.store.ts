import type { TimelineConversationSegment, TimelineState } from './timeline.types';

export class TimelineModelStore {
  private state: TimelineState = {
    segments: [],
    rowHeightPx: 8,
    pixelsPerSecond: 0.05,
    scrollY: 0,
    timeOffsetMs: Date.now(),
    minTimeMs: Date.now(),
    maxTimeMs: Date.now() + 60_000,
    viewportWidth: 1,
    viewportHeight: 1
  };

  private listeners = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): TimelineState {
    return this.state;
  }

  public setViewport(viewportWidth: number, viewportHeight: number): void {
    this.state = {
      ...this.state,
      viewportWidth: Math.max(1, Math.floor(viewportWidth)),
      viewportHeight: Math.max(1, Math.floor(viewportHeight))
    };
    this.clampAndEmit();
  }

  public setSegments(segments: TimelineConversationSegment[]): void {
    const sortedSegments = [...segments].sort((left, right) =>
      left.startMs === right.startMs
        ? left.id.localeCompare(right.id)
        : left.startMs - right.startMs
    );
    const minTimeMs = sortedSegments.reduce(
      (current, segment) => Math.min(current, segment.startMs),
      Number.POSITIVE_INFINITY
    );
    const maxTimeMs = sortedSegments.reduce(
      (current, segment) => Math.max(current, segment.endMs),
      Number.NEGATIVE_INFINITY
    );
    const safeMinTimeMs = Number.isFinite(minTimeMs) ? minTimeMs : Date.now();
    const safeMaxTimeMs = Number.isFinite(maxTimeMs) ? maxTimeMs : safeMinTimeMs + 60_000;
    const futureLimitMs = Date.now() + 24 * 60 * 60 * 1_000;

    this.state = {
      ...this.state,
      segments: sortedSegments,
      minTimeMs: safeMinTimeMs,
      maxTimeMs: Math.max(safeMinTimeMs + 1_000, safeMaxTimeMs, futureLimitMs),
      timeOffsetMs: safeMinTimeMs
    };
    const maxOffset = this.computeMaxTimeOffset(this.state.viewportWidth);
    this.state = {
      ...this.state,
      timeOffsetMs: maxOffset,
      scrollY: this.computeMaxScrollY(this.state.viewportHeight)
    };
    this.clampAndEmit();
  }

  public panByPixels(deltaXPx: number, deltaYPx: number, mainWidthPx: number, mainHeightPx: number): void {
    const deltaMs = (deltaXPx / this.state.pixelsPerSecond) * 1_000;

    this.state = {
      ...this.state,
      timeOffsetMs: this.state.timeOffsetMs + deltaMs,
      scrollY: this.state.scrollY + deltaYPx
    };
    this.clampAndEmit(mainWidthPx, mainHeightPx);
  }

  public setScrollYFromRatio(scrollRatio: number, mainHeightPx: number): void {
    const nextScrollY = this.computeMaxScrollY(mainHeightPx) * this.clamp(scrollRatio, 0, 1);
    this.state = {
      ...this.state,
      scrollY: nextScrollY
    };
    this.clampAndEmit(undefined, mainHeightPx);
  }

  public setTimeOffsetFromRatio(offsetRatio: number, mainWidthPx: number): void {
    const maxOffset = this.computeMaxTimeOffset(mainWidthPx);
    const span = Math.max(0, maxOffset - this.state.minTimeMs);

    this.state = {
      ...this.state,
      timeOffsetMs: this.state.minTimeMs + span * this.clamp(offsetRatio, 0, 1)
    };
    this.clampAndEmit(mainWidthPx);
  }

  public setHorizontalWindow(startMs: number, endMs: number, mainWidthPx: number): void {
    const width = Math.max(1, mainWidthPx);
    const minScale = this.computeMinPixelsPerSecond(width);
    const maxScale = 1;
    const normalizedStart = Math.min(startMs, endMs);
    const normalizedEnd = Math.max(startMs, endMs);
    const spanMs = Math.max(1_000, normalizedEnd - normalizedStart);
    const desiredPixelsPerSecond = width / (spanMs / 1_000);

    this.state = {
      ...this.state,
      pixelsPerSecond: this.clamp(desiredPixelsPerSecond, minScale, maxScale),
      timeOffsetMs: normalizedStart
    };
    this.clampAndEmit(width);
  }

  public setRowHeightFromRatio(zoomRatio: number): void {
    const minRowHeight = 1;
    const maxRowHeight = 50;
    this.state = {
      ...this.state,
      rowHeightPx: minRowHeight + (maxRowHeight - minRowHeight) * this.clamp(zoomRatio, 0, 1)
    };
    this.clampAndEmit();
  }

  public setHorizontalZoomFromRatio(zoomRatio: number, mainWidthPx: number): void {
    const minScale = this.computeMinPixelsPerSecond(mainWidthPx);
    const maxScale = 1;
    this.state = {
      ...this.state,
      pixelsPerSecond: minScale + (maxScale - minScale) * this.clamp(zoomRatio, 0, 1)
    };
    this.clampAndEmit(mainWidthPx);
  }

  public zoomY(multiplier: number, anchorYPx: number, mainHeightPx: number): void {
    const minRowHeight = 1;
    const maxRowHeight = 50;
    const currentTopRow = (this.state.scrollY + anchorYPx) / this.state.rowHeightPx;
    const nextRowHeight = this.clamp(this.state.rowHeightPx * multiplier, minRowHeight, maxRowHeight);
    const nextScrollY = currentTopRow * nextRowHeight - anchorYPx;

    this.state = {
      ...this.state,
      rowHeightPx: nextRowHeight,
      scrollY: nextScrollY
    };
    this.clampAndEmit(undefined, mainHeightPx);
  }

  public zoomX(multiplier: number, anchorXPx: number, mainWidthPx: number): void {
    const minScale = this.computeMinPixelsPerSecond(mainWidthPx);
    const maxScale = 1;
    const anchorTimeMs = this.state.timeOffsetMs + (anchorXPx / this.state.pixelsPerSecond) * 1_000;
    const nextScale = this.clamp(this.state.pixelsPerSecond * multiplier, minScale, maxScale);
    const nextOffsetMs = anchorTimeMs - (anchorXPx / nextScale) * 1_000;

    this.state = {
      ...this.state,
      pixelsPerSecond: nextScale,
      timeOffsetMs: nextOffsetMs
    };
    this.clampAndEmit(mainWidthPx);
  }

  private clampAndEmit(mainWidthPx?: number, mainHeightPx?: number): void {
    const width = Math.max(1, mainWidthPx ?? this.state.viewportWidth);
    const height = Math.max(1, mainHeightPx ?? this.state.viewportHeight);
    const maxScrollY = this.computeMaxScrollY(height);
    const maxTimeOffset = this.computeMaxTimeOffset(width);

    this.state = {
      ...this.state,
      scrollY: this.clamp(this.state.scrollY, 0, maxScrollY),
      pixelsPerSecond: this.clamp(this.state.pixelsPerSecond, this.computeMinPixelsPerSecond(width), 1),
      timeOffsetMs: this.clamp(this.state.timeOffsetMs, this.state.minTimeMs, maxTimeOffset)
    };

    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private computeContentHeightPx(): number {
    return this.state.segments.length * this.state.rowHeightPx;
  }

  private computeMaxScrollY(mainHeightPx: number): number {
    return Math.max(0, this.computeContentHeightPx() - mainHeightPx);
  }

  private computeVisibleDurationMs(mainWidthPx: number): number {
    return (mainWidthPx / this.state.pixelsPerSecond) * 1_000;
  }

  private computeMaxTimeOffset(mainWidthPx: number): number {
    const visibleDurationMs = this.computeVisibleDurationMs(mainWidthPx);
    const maxOffset = this.state.maxTimeMs - visibleDurationMs;

    return Math.max(this.state.minTimeMs, maxOffset);
  }

  private computeMinPixelsPerSecond(mainWidthPx: number): number {
    const fiveYearsInSeconds = 5 * 365 * 24 * 60 * 60;
    return Math.max(0.0001, mainWidthPx / fiveYearsInSeconds);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
