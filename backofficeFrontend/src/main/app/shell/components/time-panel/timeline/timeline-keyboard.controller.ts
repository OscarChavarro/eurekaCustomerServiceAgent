import { TimelineModelStore } from './timeline-model.store';

type TimelineAreaMetricsGetter = () => { mainWidth: number; mainHeight: number };
type HorizontalZoomPivot = { anchorXPx: number; anchorTimeMs?: number };
type HorizontalZoomAnchorResolver = (fallbackAnchorXPx: number, mainWidthPx: number) => HorizontalZoomPivot;

export class TimelineKeyboardController {
  constructor(
    private readonly model: TimelineModelStore,
    private readonly getAreaMetrics: TimelineAreaMetricsGetter,
    private readonly resolveHorizontalZoomAnchorX?: HorizontalZoomAnchorResolver
  ) {}

  public onKeyDown(event: KeyboardEvent): void {
    const { mainWidth, mainHeight } = this.getAreaMetrics();
    const panStep = 60;
    const zoomFactorIn = 1.12;
    const zoomFactorOut = 1 / zoomFactorIn;
    const centerAnchorX = mainWidth / 2;
    const resolvedPivot =
      this.resolveHorizontalZoomAnchorX?.(centerAnchorX, mainWidth) ?? { anchorXPx: centerAnchorX };

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.model.panByPixels(0, -panStep, mainWidth, mainHeight);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.model.panByPixels(0, panStep, mainWidth, mainHeight);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.model.panByPixels(-panStep, 0, mainWidth, mainHeight);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.model.panByPixels(panStep, 0, mainWidth, mainHeight);
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.model.zoomX(zoomFactorIn, resolvedPivot.anchorXPx, mainWidth, resolvedPivot.anchorTimeMs);
      this.model.zoomY(zoomFactorIn, mainHeight / 2, mainHeight);
      return;
    }

    if (event.key === '-') {
      event.preventDefault();
      this.model.zoomX(zoomFactorOut, resolvedPivot.anchorXPx, mainWidth, resolvedPivot.anchorTimeMs);
      this.model.zoomY(zoomFactorOut, mainHeight / 2, mainHeight);
      return;
    }

    if (event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.model.zoomX(zoomFactorIn, resolvedPivot.anchorXPx, mainWidth, resolvedPivot.anchorTimeMs);
      return;
    }

    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.model.zoomY(zoomFactorIn, mainHeight / 2, mainHeight);
      return;
    }

    if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.model.zoomX(zoomFactorOut, resolvedPivot.anchorXPx, mainWidth, resolvedPivot.anchorTimeMs);
      return;
    }

    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.model.zoomY(zoomFactorOut, mainHeight / 2, mainHeight);
    }
  }
}
