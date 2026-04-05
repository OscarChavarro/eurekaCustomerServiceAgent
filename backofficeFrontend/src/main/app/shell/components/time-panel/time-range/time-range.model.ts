import type { TimeRangeValue } from './time-range.types';

const MIN_RANGE_DURATION_MS = 1_000;

export class TimeRangeModel {
  private value: TimeRangeValue | null = null;
  private listeners = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getValue(): TimeRangeValue | null {
    return this.value;
  }

  public ensureInitialized(minTimeMs: number, maxTimeMs: number): void {
    if (this.value) {
      return;
    }

    const safeMin = Math.min(minTimeMs, maxTimeMs);
    const safeMax = Math.max(minTimeMs, maxTimeMs);
    const span = Math.max(MIN_RANGE_DURATION_MS, safeMax - safeMin);
    const defaultDuration = Math.max(MIN_RANGE_DURATION_MS, span * 0.2);

    this.value = {
      startTime: new Date(Math.max(safeMin, safeMax - defaultDuration)),
      endTime: new Date(safeMax)
    };
    this.emit();
  }

  public setRange(startTimeMs: number, endTimeMs: number): void {
    const safeStart = Math.min(startTimeMs, endTimeMs);
    const safeEnd = Math.max(startTimeMs, endTimeMs);
    const adjustedEnd = Math.max(safeEnd, safeStart + MIN_RANGE_DURATION_MS);
    this.value = {
      startTime: new Date(safeStart),
      endTime: new Date(adjustedEnd)
    };
    this.emit();
  }

  public moveStartTo(timeMs: number): void {
    if (!this.value) {
      return;
    }

    const endMs = this.value.endTime.getTime();
    const nextStartMs = Math.min(timeMs, endMs - MIN_RANGE_DURATION_MS);
    this.value = {
      startTime: new Date(nextStartMs),
      endTime: this.value.endTime
    };
    this.emit();
  }

  public moveEndTo(timeMs: number): void {
    if (!this.value) {
      return;
    }

    const startMs = this.value.startTime.getTime();
    const nextEndMs = Math.max(timeMs, startMs + MIN_RANGE_DURATION_MS);
    this.value = {
      startTime: this.value.startTime,
      endTime: new Date(nextEndMs)
    };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
