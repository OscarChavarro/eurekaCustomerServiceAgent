import { TimeRangeModel } from './time-range.model';
import type { TimeRangeRenderGeometry } from './time-range.types';

type GeometryGetter = () => TimeRangeRenderGeometry | null;
type DragHandle = 'none' | 'start' | 'end';
const LINE_HIT_RADIUS_PX = 4;

export class TimeRangeController {
  private dragHandle: DragHandle = 'none';

  constructor(
    private readonly model: TimeRangeModel,
    private readonly getGeometry: GeometryGetter
  ) {}

  public onMouseDown(event: MouseEvent): boolean {
    const geometry = this.getGeometry();
    if (!geometry) {
      return false;
    }

    const point = { x: event.offsetX, y: event.offsetY };

    if (this.isNearVerticalLine(point, geometry.startXPx, geometry)) {
      this.dragHandle = 'start';
      return true;
    }

    if (this.isNearVerticalLine(point, geometry.endXPx, geometry)) {
      this.dragHandle = 'end';
      return true;
    }

    if (this.isInsideRect(geometry.startHitRect, point)) {
      this.dragHandle = 'start';
      return true;
    }

    if (this.isInsideRect(geometry.endHitRect, point)) {
      this.dragHandle = 'end';
      return true;
    }

    this.dragHandle = 'none';
    return false;
  }

  public onMouseMove(event: MouseEvent): boolean {
    if (this.dragHandle === 'none') {
      return false;
    }

    const geometry = this.getGeometry();
    if (!geometry) {
      return false;
    }

    return this.applyDragForOffsetX(event.offsetX, geometry);
  }

  public onPointerMove(offsetX: number): boolean {
    if (this.dragHandle === 'none') {
      return false;
    }

    const geometry = this.getGeometry();
    if (!geometry) {
      return false;
    }

    return this.applyDragForOffsetX(offsetX, geometry);
  }

  public onMouseUp(): void {
    this.dragHandle = 'none';
  }

  public getCursor(event: MouseEvent): string | null {
    const geometry = this.getGeometry();
    if (!geometry) {
      return null;
    }

    const point = { x: event.offsetX, y: event.offsetY };

    if (
      this.isNearVerticalLine(point, geometry.startXPx, geometry) ||
      this.isNearVerticalLine(point, geometry.endXPx, geometry)
    ) {
      return 'ew-resize';
    }

    if (this.isInsideRect(geometry.startHitRect, point) || this.isInsideRect(geometry.endHitRect, point)) {
      return 'ew-resize';
    }

    if (this.dragHandle === 'start' || this.dragHandle === 'end') {
      return 'ew-resize';
    }

    return null;
  }

  public isDragging(): boolean {
    return this.dragHandle !== 'none';
  }

  private canvasXToTimeMs(x: number, geometry: TimeRangeRenderGeometry): number {
    const normalized = (x - geometry.mainRect.x) / Math.max(1, geometry.mainRect.width);
    const clamped = this.clamp(normalized, 0, 1);
    return geometry.visibleStartMs + clamped * (geometry.visibleEndMs - geometry.visibleStartMs);
  }

  private applyDragForOffsetX(offsetX: number, geometry: TimeRangeRenderGeometry): boolean {
    const clampedX = this.clamp(offsetX, geometry.mainRect.x, geometry.mainRect.x + geometry.mainRect.width);
    const nextTimeMs = this.canvasXToTimeMs(clampedX, geometry);

    if (this.dragHandle === 'start') {
      this.model.moveStartTo(nextTimeMs);
      return true;
    }

    this.model.moveEndTo(nextTimeMs);
    return true;
  }

  private isInsideRect(rect: { x: number; y: number; width: number; height: number }, point: { x: number; y: number }): boolean {
    return (
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height
    );
  }

  private isNearVerticalLine(
    point: { x: number; y: number },
    lineX: number,
    geometry: TimeRangeRenderGeometry
  ): boolean {
    const lineTop = geometry.rulerRect.y;
    const lineBottom = geometry.mainRect.y + geometry.mainRect.height;

    if (point.y < lineTop || point.y > lineBottom) {
      return false;
    }

    return Math.abs(point.x - lineX) <= LINE_HIT_RADIUS_PX;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
