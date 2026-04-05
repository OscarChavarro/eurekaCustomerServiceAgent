import { TimelineModelStore } from '../timeline/timeline-model.store';
import { TimeRangeModel } from './time-range.model';
import type { TimeRangeRenderGeometry } from './time-range.types';
import type { TimelineRect, TimelineRenderMetrics } from '../timeline/timeline.types';

const HANDLE_HALF_WIDTH = 6;
const HANDLE_HEIGHT = 8;
const HIT_PADDING_X = 8;
const HIT_PADDING_Y = 6;

export class CanvasTimeRangeRenderer {
  constructor(
    private readonly timelineModel: TimelineModelStore,
    private readonly timeRangeModel: TimeRangeModel
  ) {}

  public render(context: CanvasRenderingContext2D, metrics: TimelineRenderMetrics): TimeRangeRenderGeometry | null {
    const value = this.timeRangeModel.getValue();
    if (!value) {
      return null;
    }

    const state = this.timelineModel.getState();
    const visibleStartMs = state.timeOffsetMs;
    const visibleEndMs = state.timeOffsetMs + (metrics.mainRect.width / state.pixelsPerSecond) * 1_000;
    const startXPx = this.timeToCanvasX(value.startTime.getTime(), metrics.mainRect, state.timeOffsetMs, state.pixelsPerSecond);
    const endXPx = this.timeToCanvasX(value.endTime.getTime(), metrics.mainRect, state.timeOffsetMs, state.pixelsPerSecond);

    const startHandleRect = this.buildHandleRect(startXPx, metrics.rulerRect);
    const endHandleRect = this.buildHandleRect(endXPx, metrics.rulerRect);
    const startHitRect = this.expandRect(startHandleRect, HIT_PADDING_X, HIT_PADDING_Y);
    const endHitRect = this.expandRect(endHandleRect, HIT_PADDING_X, HIT_PADDING_Y);

    this.drawRangeLine(context, startXPx, metrics.mainRect, '#2b6dd8');
    this.drawRangeLine(context, endXPx, metrics.mainRect, '#2b6dd8');
    this.drawHandle(context, startHandleRect, '#1f5bb7');
    this.drawHandle(context, endHandleRect, '#1f5bb7');

    return {
      rulerRect: metrics.rulerRect,
      mainRect: metrics.mainRect,
      startHandleRect,
      endHandleRect,
      startHitRect,
      endHitRect,
      visibleStartMs,
      visibleEndMs,
      startXPx,
      endXPx
    };
  }

  private timeToCanvasX(timeMs: number, mainRect: TimelineRect, timeOffsetMs: number, pixelsPerSecond: number): number {
    return mainRect.x + ((timeMs - timeOffsetMs) / 1_000) * pixelsPerSecond;
  }

  private drawRangeLine(
    context: CanvasRenderingContext2D,
    x: number,
    mainRect: TimelineRect,
    color: string
  ): void {
    if (x < mainRect.x - 1 || x > mainRect.x + mainRect.width + 1) {
      return;
    }

    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(Math.round(x) + 0.5, 0);
    context.lineTo(Math.round(x) + 0.5, mainRect.y + mainRect.height);
    context.stroke();
  }

  private drawHandle(context: CanvasRenderingContext2D, rect: TimelineRect, color: string): void {
    const apexX = rect.x + rect.width / 2;
    const apexY = rect.y + rect.height;
    const baseY = rect.y;

    context.fillStyle = color;
    context.beginPath();
    context.moveTo(apexX, apexY);
    context.lineTo(rect.x, baseY);
    context.lineTo(rect.x + rect.width, baseY);
    context.closePath();
    context.fill();
  }

  private buildHandleRect(x: number, rulerRect: TimelineRect): TimelineRect {
    return {
      x: x - HANDLE_HALF_WIDTH,
      y: rulerRect.y + 2,
      width: HANDLE_HALF_WIDTH * 2,
      height: HANDLE_HEIGHT
    };
  }

  private expandRect(rect: TimelineRect, paddingX: number, paddingY: number): TimelineRect {
    return {
      x: rect.x - paddingX,
      y: rect.y - paddingY,
      width: rect.width + paddingX * 2,
      height: rect.height + paddingY * 2
    };
  }
}
