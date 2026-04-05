import { TimeCursorModel } from './time-cursor.model';
import { TimelineModelStore } from '../timeline/timeline-model.store';
import type { TimelineRenderMetrics } from '../timeline/timeline.types';

type MetricsGetter = () => TimelineRenderMetrics | null;

export class TimeCursorController {
  constructor(
    private readonly model: TimeCursorModel,
    private readonly timelineModel: TimelineModelStore,
    private readonly getMetrics: MetricsGetter
  ) {}

  public onMouseMove(event: MouseEvent): void {
    const metrics = this.getMetrics();
    if (!metrics) {
      return;
    }

    const x = event.offsetX;
    const y = event.offsetY;

    if (!this.isInsideRect(metrics.mainRect, x, y) && !this.isInsideRect(metrics.rulerRect, x, y)) {
      this.model.setValue(null);
      return;
    }

    const timelineState = this.timelineModel.getState();
    const clampedX = this.clamp(x, metrics.mainRect.x, metrics.mainRect.x + metrics.mainRect.width);
    const timeMs = timelineState.timeOffsetMs + ((clampedX - metrics.mainRect.x) / timelineState.pixelsPerSecond) * 1_000;

    let conversationName: string | null = null;
    if (this.isInsideRect(metrics.mainRect, x, y)) {
      const rowIndex = Math.floor((timelineState.scrollY + y - metrics.mainRect.y) / timelineState.rowHeightPx);
      const segment = timelineState.segments[rowIndex];
      conversationName = segment?.id ?? null;
    }

    this.model.setValue({
      time: new Date(timeMs),
      x,
      y,
      conversationName
    });
  }

  public onMouseLeave(): void {
    this.model.setValue(null);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private isInsideRect(rect: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean {
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
  }
}
