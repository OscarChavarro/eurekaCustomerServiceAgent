export type TimelineConversationSegment = {
  id: string;
  startMs: number;
  endMs: number;
  color: string;
};

export type TimelineState = {
  segments: TimelineConversationSegment[];
  rowHeightPx: number;
  pixelsPerSecond: number;
  scrollY: number;
  timeOffsetMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type TimelineRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TimelineRenderMetrics = {
  mainRect: TimelineRect;
  horizontalScrollTrackRect: TimelineRect;
  horizontalScrollThumbRect: TimelineRect;
  horizontalZoomWheelRect: TimelineRect;
  horizontalZoomKnobRect: TimelineRect;
  verticalScrollTrackRect: TimelineRect;
  verticalScrollThumbRect: TimelineRect;
  verticalZoomWheelRect: TimelineRect;
  verticalZoomKnobRect: TimelineRect;
};
