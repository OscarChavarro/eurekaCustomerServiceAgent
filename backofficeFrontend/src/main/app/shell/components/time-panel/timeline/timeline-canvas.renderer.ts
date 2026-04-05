import { I18nService } from '../../../../core/i18n/services/i18n.service';
import { I18N_KEYS } from '../../../../core/i18n/translations/i18n-keys.const';
import type { SupportedLanguage } from '../../../../core/i18n/types/supported-language.type';
import { TimelineModelStore } from './timeline-model.store';
import type { TimelineRect, TimelineRenderMetrics } from './timeline.types';

const RULER_HEIGHT = 28;
const TRACK_THICKNESS = 9;
const RIGHT_CONTROLS_WIDTH = TRACK_THICKNESS;
const BOTTOM_CONTROLS_HEIGHT = TRACK_THICKNESS;
const MIN_THUMB_SIZE = 18;
const HORIZONTAL_ZOOM_ZONE_RATIO = 0.1;
const VERTICAL_ZOOM_ZONE_RATIO = 0.2;
const OUT_OF_RANGE_COLOR = '#c4ccd4';

type ActiveTimeRange = {
  startMs: number;
  endMs: number;
};

export class TimelineCanvasRenderer {
  constructor(
    private readonly model: TimelineModelStore,
    private readonly i18nService: I18nService,
    private readonly getLanguage: () => SupportedLanguage,
    private readonly getActiveTimeRange: () => ActiveTimeRange | null
  ) {}

  public render(context: CanvasRenderingContext2D, width: number, height: number): TimelineRenderMetrics {
    const state = this.model.getState();
    const mainRect: TimelineRect = {
      x: 0,
      y: RULER_HEIGHT,
      width: Math.max(1, width - RIGHT_CONTROLS_WIDTH),
      height: Math.max(1, height - RULER_HEIGHT - BOTTOM_CONTROLS_HEIGHT)
    };

    this.drawBackground(context, width, height);
    this.drawMainAreaBackground(context, mainRect);
    this.drawTimeGrid(context, mainRect);
    this.drawSegments(context, mainRect);
    const rulerRect = this.drawTopRuler(context, width, mainRect);
    const metrics = this.drawControls(context, width, height, rulerRect, mainRect);

    if (state.segments.length === 0) {
      this.drawCenteredStatus(
        context,
        mainRect,
        this.i18nService.get(I18N_KEYS.shell.TIME_PANEL_LOADING, this.getLanguage())
      );
    }

    return metrics;
  }

  private drawBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }

  private drawMainAreaBackground(context: CanvasRenderingContext2D, mainRect: TimelineRect): void {
    context.fillStyle = '#ffffff';
    context.fillRect(mainRect.x, mainRect.y, mainRect.width, mainRect.height);
  }

  private drawTimeGrid(context: CanvasRenderingContext2D, mainRect: TimelineRect): void {
    const state = this.model.getState();
    const secondsPerPixel = 1 / state.pixelsPerSecond;
    const targetStepPx = 95;
    const stepSeconds = this.pickTimeStepSeconds(secondsPerPixel * targetStepPx);
    const stepMs = stepSeconds * 1_000;
    const firstTickMs = Math.floor(state.timeOffsetMs / stepMs) * stepMs;
    const visibleEndMs = state.timeOffsetMs + (mainRect.width / state.pixelsPerSecond) * 1_000;

    context.strokeStyle = '#e2e8ee';
    context.lineWidth = 1;

    for (let tickMs = firstTickMs; tickMs <= visibleEndMs + stepMs; tickMs += stepMs) {
      const x = mainRect.x + ((tickMs - state.timeOffsetMs) / 1_000) * state.pixelsPerSecond;
      if (x < mainRect.x - 1 || x > mainRect.x + mainRect.width + 1) {
        continue;
      }

      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, mainRect.y);
      context.lineTo(Math.round(x) + 0.5, mainRect.y + mainRect.height);
      context.stroke();
    }

    const firstVisibleRow = Math.floor(state.scrollY / state.rowHeightPx);
    const visibleRows = Math.ceil(mainRect.height / state.rowHeightPx) + 1;

    context.strokeStyle = '#f2f5f8';
    for (let rowIndex = firstVisibleRow; rowIndex <= firstVisibleRow + visibleRows; rowIndex += 1) {
      const y = mainRect.y + rowIndex * state.rowHeightPx - state.scrollY;
      context.beginPath();
      context.moveTo(mainRect.x, Math.round(y) + 0.5);
      context.lineTo(mainRect.x + mainRect.width, Math.round(y) + 0.5);
      context.stroke();
    }
  }

  private drawSegments(context: CanvasRenderingContext2D, mainRect: TimelineRect): void {
    const state = this.model.getState();
    const activeTimeRange = this.getActiveTimeRange();
    const firstVisibleRow = Math.floor(state.scrollY / state.rowHeightPx);
    const visibleRows = Math.ceil(mainRect.height / state.rowHeightPx) + 2;
    const rowStart = Math.max(0, firstVisibleRow);
    const rowEnd = Math.min(state.segments.length - 1, firstVisibleRow + visibleRows);

    for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
      const segment = state.segments[rowIndex];
      if (!segment) {
        continue;
      }

      const y = mainRect.y + rowIndex * state.rowHeightPx - state.scrollY;
      const xStart = mainRect.x + ((segment.startMs - state.timeOffsetMs) / 1_000) * state.pixelsPerSecond;
      const xEnd = mainRect.x + ((segment.endMs - state.timeOffsetMs) / 1_000) * state.pixelsPerSecond;
      const clippedStart = Math.max(mainRect.x, xStart);
      const clippedEnd = Math.min(mainRect.x + mainRect.width, xEnd);

      if (clippedEnd <= clippedStart) {
        continue;
      }

      context.fillStyle = this.resolveSegmentColor(segment.startMs, segment.endMs, segment.color, activeTimeRange);
      context.fillRect(
        clippedStart,
        Math.max(mainRect.y, y + 1),
        Math.max(1, clippedEnd - clippedStart),
        Math.max(1, state.rowHeightPx - 2)
      );
    }
  }

  private drawTopRuler(
    context: CanvasRenderingContext2D,
    width: number,
    mainRect: TimelineRect
  ): TimelineRect {
    const state = this.model.getState();
    const rulerRect: TimelineRect = {
      x: 0,
      y: 0,
      width: Math.max(1, width - RIGHT_CONTROLS_WIDTH),
      height: RULER_HEIGHT
    };

    context.fillStyle = '#f4f7fa';
    context.fillRect(rulerRect.x, rulerRect.y, rulerRect.width, rulerRect.height);
    context.strokeStyle = '#dbe3ea';
    context.beginPath();
    context.moveTo(0, rulerRect.height - 0.5);
    context.lineTo(rulerRect.width, rulerRect.height - 0.5);
    context.stroke();

    const secondsPerPixel = 1 / state.pixelsPerSecond;
    const targetStepPx = 120;
    const stepSeconds = this.pickTimeStepSeconds(secondsPerPixel * targetStepPx);
    const stepMs = stepSeconds * 1_000;
    const firstTickMs = Math.floor(state.timeOffsetMs / stepMs) * stepMs;
    const visibleEndMs = state.timeOffsetMs + (mainRect.width / state.pixelsPerSecond) * 1_000;
    const isHourScale = stepSeconds >= 60 && stepSeconds < 86_400;

    context.strokeStyle = '#bccad8';
    context.fillStyle = '#4e5d6d';
    context.font = '11px system-ui, sans-serif';
    context.textBaseline = 'middle';

    if (isHourScale) {
      this.drawCenteredDayHeader(context, rulerRect, state.timeOffsetMs, visibleEndMs);
    }

    for (let tickMs = firstTickMs; tickMs <= visibleEndMs + stepMs; tickMs += stepMs) {
      const x = ((tickMs - state.timeOffsetMs) / 1_000) * state.pixelsPerSecond;
      if (x < -1 || x > rulerRect.width + 1) {
        continue;
      }

      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, rulerRect.height - 8);
      context.lineTo(Math.round(x) + 0.5, rulerRect.height);
      context.stroke();

      const tickLabel = this.formatTickLabel(tickMs, stepSeconds);
      const labelX = Math.round(x) + 4;
      const labelWidth = context.measureText(tickLabel).width;
      if (this.shouldRenderLabel(labelX, labelWidth, rulerRect.width)) {
        const labelY = isHourScale ? 18 : 11;
        context.fillText(tickLabel, labelX, labelY);
      }
    }

    return rulerRect;
  }

  private drawControls(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    rulerRect: TimelineRect,
    mainRect: TimelineRect
  ): TimelineRenderMetrics {
    const state = this.model.getState();
    const contentHeight = state.segments.length * state.rowHeightPx;
    const visibleDurationMs = (mainRect.width / state.pixelsPerSecond) * 1_000;
    const totalDurationMs = Math.max(1_000, state.maxTimeMs - state.minTimeMs);
    const maxScrollY = Math.max(0, contentHeight - mainRect.height);
    const maxTimeOffset = Math.max(state.minTimeMs, state.maxTimeMs - visibleDurationMs);

    const verticalZoomZoneHeight = Math.max(24, Math.floor(mainRect.height * VERTICAL_ZOOM_ZONE_RATIO));
    const verticalScrollTrackHeight = Math.max(1, mainRect.height - verticalZoomZoneHeight);
    const verticalScrollTrackRect: TimelineRect = {
      x: width - TRACK_THICKNESS,
      y: RULER_HEIGHT,
      width: TRACK_THICKNESS,
      height: verticalScrollTrackHeight
    };
    const verticalScrollThumbHeight = Math.max(
      MIN_THUMB_SIZE,
      verticalScrollTrackRect.height * (mainRect.height / Math.max(mainRect.height, contentHeight))
    );
    const verticalScrollThumbTop =
      verticalScrollTrackRect.y +
      (maxScrollY <= 0
        ? 0
        : (state.scrollY / maxScrollY) * (verticalScrollTrackRect.height - verticalScrollThumbHeight));
    const verticalScrollThumbRect: TimelineRect = {
      x: verticalScrollTrackRect.x,
      y: verticalScrollThumbTop,
      width: verticalScrollTrackRect.width,
      height: verticalScrollThumbHeight
    };

    const horizontalZoomZoneWidth = Math.max(24, Math.floor(mainRect.width * HORIZONTAL_ZOOM_ZONE_RATIO));
    const horizontalScrollTrackWidth = Math.max(1, mainRect.width - horizontalZoomZoneWidth);
    const horizontalScrollTrackRect: TimelineRect = {
      x: 0,
      y: height - TRACK_THICKNESS,
      width: horizontalScrollTrackWidth,
      height: TRACK_THICKNESS
    };
    const horizontalScrollThumbWidth = Math.max(
      MIN_THUMB_SIZE,
      horizontalScrollTrackRect.width * (visibleDurationMs / Math.max(totalDurationMs, visibleDurationMs))
    );
    const horizontalScrollThumbLeft =
      horizontalScrollTrackRect.x +
      (maxTimeOffset <= state.minTimeMs
        ? 0
        : ((state.timeOffsetMs - state.minTimeMs) / (maxTimeOffset - state.minTimeMs)) *
          (horizontalScrollTrackRect.width - horizontalScrollThumbWidth));
    const horizontalScrollThumbRect: TimelineRect = {
      x: horizontalScrollThumbLeft,
      y: horizontalScrollTrackRect.y,
      width: horizontalScrollThumbWidth,
      height: horizontalScrollTrackRect.height
    };

    const verticalZoomWheelRect: TimelineRect = {
      x: width - TRACK_THICKNESS,
      y: RULER_HEIGHT + verticalScrollTrackHeight,
      width: TRACK_THICKNESS,
      height: verticalZoomZoneHeight
    };
    const verticalZoomKnobRect: TimelineRect = {
      x: verticalZoomWheelRect.x,
      y: verticalZoomWheelRect.y + Math.floor((verticalZoomWheelRect.height - 2) / 2),
      width: verticalZoomWheelRect.width,
      height: 2
    };

    const minScale = Math.max(0.0001, mainRect.width / (5 * 365 * 24 * 60 * 60));
    const horizontalZoomWheelRect: TimelineRect = {
      x: horizontalScrollTrackWidth,
      y: height - TRACK_THICKNESS,
      width: horizontalZoomZoneWidth,
      height: TRACK_THICKNESS
    };
    const horizontalZoomKnobRect: TimelineRect = {
      x: horizontalZoomWheelRect.x + Math.floor((horizontalZoomWheelRect.width - 2) / 2),
      y: horizontalZoomWheelRect.y,
      width: 2,
      height: horizontalZoomWheelRect.height
    };

    this.drawTrack(context, verticalScrollTrackRect, '#e7edf2');
    this.drawThumb(context, verticalScrollThumbRect, '#9eb0c1');
    this.drawTrack(context, horizontalScrollTrackRect, '#e7edf2');
    this.drawThumb(context, horizontalScrollThumbRect, '#9eb0c1');
    this.drawZoomWheelVertical(context, verticalZoomWheelRect, state.rowHeightPx);
    this.drawZoomWheelHorizontal(context, horizontalZoomWheelRect, state.pixelsPerSecond, minScale);
    this.drawThumb(context, verticalZoomKnobRect, '#2f3d4a');
    this.drawThumb(context, horizontalZoomKnobRect, '#2f3d4a');

    return {
      rulerRect,
      mainRect,
      horizontalScrollTrackRect,
      horizontalScrollThumbRect,
      horizontalZoomWheelRect,
      horizontalZoomKnobRect,
      verticalScrollTrackRect,
      verticalScrollThumbRect,
      verticalZoomWheelRect,
      verticalZoomKnobRect
    };
  }

  private drawCenteredStatus(context: CanvasRenderingContext2D, rect: TimelineRect, text: string): void {
    context.fillStyle = '#6c7b89';
    context.font = '12px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2);
    context.textAlign = 'start';
  }

  private drawTrack(context: CanvasRenderingContext2D, rect: TimelineRect, color: string): void {
    context.fillStyle = color;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  private drawThumb(context: CanvasRenderingContext2D, rect: TimelineRect, color: string): void {
    context.fillStyle = color;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  private drawZoomWheelVertical(
    context: CanvasRenderingContext2D,
    rect: TimelineRect,
    rowHeightPx: number
  ): void {
    context.fillStyle = '#d5dde5';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);

    const spacing = 3;
    const phase = (rowHeightPx * 2) % spacing;

    context.strokeStyle = '#8c9aaa';
    context.lineWidth = 1;
    for (let y = rect.y + phase; y <= rect.y + rect.height; y += spacing) {
      context.beginPath();
      context.moveTo(rect.x + 1, Math.round(y) + 0.5);
      context.lineTo(rect.x + rect.width - 1, Math.round(y) + 0.5);
      context.stroke();
    }
  }

  private drawZoomWheelHorizontal(
    context: CanvasRenderingContext2D,
    rect: TimelineRect,
    pixelsPerSecond: number,
    minScale: number
  ): void {
    context.fillStyle = '#d5dde5';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);

    const spacing = 3;
    const normalized = (pixelsPerSecond - minScale) / (1 - minScale);
    const phase = (normalized * 100) % spacing;

    context.strokeStyle = '#8c9aaa';
    context.lineWidth = 1;
    for (let x = rect.x + phase; x <= rect.x + rect.width; x += spacing) {
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, rect.y + 1);
      context.lineTo(Math.round(x) + 0.5, rect.y + rect.height - 1);
      context.stroke();
    }
  }

  private pickTimeStepSeconds(minimumStepSeconds: number): number {
    const steps = [
      1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600, 7_200, 14_400, 21_600, 43_200, 86_400,
      172_800, 604_800, 2_592_000, 7_776_000, 15_552_000, 31_536_000
    ];

    return steps.find((step) => step >= minimumStepSeconds) ?? steps[steps.length - 1]!;
  }

  private formatTickLabel(tickMs: number, stepSeconds: number): string {
    const date = new Date(tickMs);

    if (stepSeconds >= 31_536_000) {
      return String(date.getUTCFullYear());
    }

    if (stepSeconds >= 86_400) {
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${date.getUTCFullYear()}-${month}-${day}`;
    }

    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    if (stepSeconds >= 60 && stepSeconds < 86_400) {
      const hour24 = date.getUTCHours();
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      const amPm = hour24 >= 12 ? 'PM' : 'AM';
      return `${hour12}:${minutes} ${amPm}`;
    }

    if (stepSeconds >= 60) {
      return `${hours}:${minutes}`;
    }

    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private drawCenteredDayHeader(
    context: CanvasRenderingContext2D,
    rulerRect: TimelineRect,
    visibleStartMs: number,
    visibleEndMs: number
  ): void {
    const locale = this.i18nService.get(I18N_KEYS.shell.TIME_PANEL_DATE_LOCALE, this.getLanguage());
    const centerMs = visibleStartMs + (visibleEndMs - visibleStartMs) / 2;
    const centerDate = new Date(centerMs);
    const headerText = this.buildCenteredDayHeader(centerDate, locale);

    context.fillStyle = '#3f4e5d';
    context.font = '10px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText(headerText, rulerRect.x + rulerRect.width / 2, 7);
    context.textAlign = 'start';
    context.font = '11px system-ui, sans-serif';
    context.fillStyle = '#4e5d6d';
  }

  private shouldRenderLabel(labelX: number, labelWidth: number, viewportWidth: number): boolean {
    return labelX <= viewportWidth && labelX + labelWidth >= 0;
  }

  private resolveSegmentColor(
    segmentStartMs: number,
    segmentEndMs: number,
    defaultColor: string,
    activeTimeRange: ActiveTimeRange | null
  ): string {
    if (!activeTimeRange) {
      return defaultColor;
    }

    const intersects =
      segmentStartMs <= activeTimeRange.endMs && segmentEndMs >= activeTimeRange.startMs;

    return intersects ? defaultColor : OUT_OF_RANGE_COLOR;
  }

  private buildCenteredDayHeader(date: Date, locale: string): string {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date);
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(date);
    const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(date);
    const year = new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }).format(date);
    const language = this.getLanguage();

    if (language === 'es') {
      return `${this.capitalize(weekday)} ${day} de ${month} de ${year}`;
    }

    return `${this.capitalize(weekday)} ${month} ${day}, ${year}`;
  }

  private capitalize(value: string): string {
    if (!value) {
      return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
