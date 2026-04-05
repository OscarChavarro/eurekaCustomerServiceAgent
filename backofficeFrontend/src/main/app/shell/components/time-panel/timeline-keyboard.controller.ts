import { TimelineModelStore } from './timeline-model.store';

type TimelineAreaMetricsGetter = () => { mainWidth: number; mainHeight: number };

export class TimelineKeyboardController {
  constructor(
    private readonly model: TimelineModelStore,
    private readonly getAreaMetrics: TimelineAreaMetricsGetter
  ) {}

  public onKeyDown(event: KeyboardEvent): void {
    const { mainWidth, mainHeight } = this.getAreaMetrics();
    const panStep = 60;
    const zoomFactorIn = 1.12;
    const zoomFactorOut = 1 / zoomFactorIn;

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
      this.model.zoomX(zoomFactorIn, mainWidth / 2, mainWidth);
      this.model.zoomY(zoomFactorIn, mainHeight / 2, mainHeight);
      return;
    }

    if (event.key === '-') {
      event.preventDefault();
      this.model.zoomX(zoomFactorOut, mainWidth / 2, mainWidth);
      this.model.zoomY(zoomFactorOut, mainHeight / 2, mainHeight);
      return;
    }

    if (event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.model.zoomX(zoomFactorIn, mainWidth / 2, mainWidth);
      return;
    }

    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.model.zoomY(zoomFactorIn, mainHeight / 2, mainHeight);
      return;
    }

    if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.model.zoomX(zoomFactorOut, mainWidth / 2, mainWidth);
      return;
    }

    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.model.zoomY(zoomFactorOut, mainHeight / 2, mainHeight);
    }
  }
}
