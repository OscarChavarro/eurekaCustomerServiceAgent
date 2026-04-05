import type { TimelineRect } from './timeline.types';

export type TimeRangeValue = {
  startTime: Date;
  endTime: Date;
};

export type TimeRangeRenderGeometry = {
  rulerRect: TimelineRect;
  mainRect: TimelineRect;
  startHandleRect: TimelineRect;
  endHandleRect: TimelineRect;
  startHitRect: TimelineRect;
  endHitRect: TimelineRect;
  visibleStartMs: number;
  visibleEndMs: number;
  startXPx: number;
  endXPx: number;
};
