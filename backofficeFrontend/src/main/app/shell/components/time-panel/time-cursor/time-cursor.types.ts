import type { TimelineRect } from '../timeline/timeline.types';

export type TimeCursorValue = {
  time: Date;
  x: number;
  y: number;
  conversationId: string | null;
  conversationLabel: string | null;
};

export type TimeCursorRenderGeometry = {
  mainRect: TimelineRect;
  rulerRect: TimelineRect;
};
