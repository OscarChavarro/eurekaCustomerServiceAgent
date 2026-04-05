import { TimelineModelStore } from './timeline-model.store';
import type { TimelineRect, TimelineRenderMetrics } from './timeline.types';

type MetricsGetter = () => TimelineRenderMetrics | null;

type DragMode = 'none' | 'pan' | 'v-scroll' | 'h-scroll' | 'v-zoom' | 'h-zoom';

export class TimelinePointerController {
  private dragMode: DragMode = 'none';
  private dragOriginX = 0;
  private dragOriginY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private hasDragged = false;

  constructor(
    private readonly model: TimelineModelStore,
    private readonly getMetrics: MetricsGetter,
    private readonly onConversationRowClick: (rowIndex: number) => void
  ) {}

  public onWheel(event: WheelEvent): void {
    const metrics = this.getMetrics();
    if (!metrics || !this.isInsideRect(metrics.mainRect, { x: event.offsetX, y: event.offsetY })) {
      return;
    }

    event.preventDefault();

    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const anchorX = event.offsetX - metrics.mainRect.x;
    const anchorY = event.offsetY - metrics.mainRect.y;

    if (event.ctrlKey || event.metaKey) {
      this.model.zoomX(zoomFactor, anchorX, metrics.mainRect.width);
      this.model.zoomY(zoomFactor, anchorY, metrics.mainRect.height);
      return;
    }

    if (event.altKey) {
      this.model.zoomX(zoomFactor, anchorX, metrics.mainRect.width);
      return;
    }

    if (event.shiftKey) {
      this.model.zoomY(zoomFactor, anchorY, metrics.mainRect.height);
      return;
    }

    this.model.panByPixels(event.deltaX, event.deltaY, metrics.mainRect.width, metrics.mainRect.height);
  }

  public onMouseDown(event: MouseEvent): void {
    const metrics = this.getMetrics();

    if (!metrics) {
      return;
    }

    const point = { x: event.offsetX, y: event.offsetY };

    this.pointerDownX = point.x;
    this.pointerDownY = point.y;
    this.hasDragged = false;

    if (this.isInsideRect(metrics.verticalScrollThumbRect, point)) {
      this.dragMode = 'v-scroll';
      this.dragOriginY = point.y;
      return;
    }

    if (this.isInsideRect(metrics.horizontalScrollThumbRect, point)) {
      this.dragMode = 'h-scroll';
      this.dragOriginX = point.x;
      return;
    }

    if (this.isInsideRect(metrics.verticalZoomKnobRect, point) || this.isInsideRect(metrics.verticalZoomWheelRect, point)) {
      this.dragMode = 'v-zoom';
      this.dragOriginY = point.y;
      return;
    }

    if (this.isInsideRect(metrics.horizontalZoomKnobRect, point) || this.isInsideRect(metrics.horizontalZoomWheelRect, point)) {
      this.dragMode = 'h-zoom';
      this.dragOriginX = point.x;
      return;
    }

    if (this.isInsideRect(metrics.mainRect, point)) {
      this.dragMode = 'pan';
      this.dragOriginX = point.x;
      this.dragOriginY = point.y;
    }
  }

  public onMouseMove(event: MouseEvent): void {
    if (this.dragMode === 'none') {
      return;
    }

    const metrics = this.getMetrics();

    if (!metrics) {
      return;
    }

    const point = { x: event.offsetX, y: event.offsetY };
    if (Math.abs(point.x - this.pointerDownX) > 2 || Math.abs(point.y - this.pointerDownY) > 2) {
      this.hasDragged = true;
    }

    if (this.dragMode === 'pan') {
      const deltaX = this.dragOriginX - point.x;
      const deltaY = this.dragOriginY - point.y;
      this.dragOriginX = point.x;
      this.dragOriginY = point.y;
      this.model.panByPixels(deltaX, deltaY, metrics.mainRect.width, metrics.mainRect.height);
      return;
    }

    if (this.dragMode === 'v-scroll') {
      const ratio = this.normalizedVerticalRatio(point.y, metrics.verticalScrollTrackRect);
      this.model.setScrollYFromRatio(ratio, metrics.mainRect.height);
      return;
    }

    if (this.dragMode === 'h-scroll') {
      const ratio = this.normalizedHorizontalRatio(point.x, metrics.horizontalScrollTrackRect);
      this.model.setTimeOffsetFromRatio(ratio, metrics.mainRect.width);
      return;
    }

    if (this.dragMode === 'v-zoom') {
      const deltaY = point.y - this.dragOriginY;
      this.dragOriginY = point.y;
      const zoomFactor = Math.exp(-deltaY * 0.015);
      this.model.zoomY(zoomFactor, metrics.mainRect.height / 2, metrics.mainRect.height);
      return;
    }

    if (this.dragMode === 'h-zoom') {
      const deltaX = point.x - this.dragOriginX;
      this.dragOriginX = point.x;
      const zoomFactor = Math.exp(deltaX * 0.015);
      this.model.zoomX(zoomFactor, metrics.mainRect.width / 2, metrics.mainRect.width);
    }
  }

  public onMouseUp(event: MouseEvent): void {
    const metrics = this.getMetrics();

    if (metrics && this.dragMode === 'pan' && !this.hasDragged) {
      const point = { x: event.offsetX, y: event.offsetY };
      if (this.isInsideRect(metrics.mainRect, point)) {
        const state = this.model.getState();
        const rowIndex = Math.floor((state.scrollY + point.y - metrics.mainRect.y) / state.rowHeightPx);
        if (rowIndex >= 0 && rowIndex < state.segments.length) {
          this.onConversationRowClick(rowIndex);
        }
      }
    }

    this.dragMode = 'none';
    this.hasDragged = false;
  }

  private normalizedVerticalRatio(y: number, track: TimelineRect): number {
    return this.clamp((y - track.y) / Math.max(1, track.height), 0, 1);
  }

  private normalizedHorizontalRatio(x: number, track: TimelineRect): number {
    return this.clamp((x - track.x) / Math.max(1, track.width), 0, 1);
  }

  private isInsideRect(rect: TimelineRect, point: { x: number; y: number }): boolean {
    return (
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
