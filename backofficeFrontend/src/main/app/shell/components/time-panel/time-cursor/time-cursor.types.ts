import type { TimelineRect } from '../timeline/timeline.types';

export type TimeCursorValue = {
  time: Date;
  x: number;
  y: number;
  conversationName: string | null;
};

export type TimeCursorRenderGeometry = {
  mainRect: TimelineRect;
  rulerRect: TimelineRect;
};
