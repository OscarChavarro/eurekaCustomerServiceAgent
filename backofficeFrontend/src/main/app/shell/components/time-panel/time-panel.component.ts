import {
  AfterViewInit,
  Component,
  ElementRef,
  effect,
  inject,
  OnDestroy,
  output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { BackendConversationSummary } from '../../../core/api/services/conversations-api.service';
import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';
import { ChatConversationService } from '../../services/chat-conversation.service';
import { CanvasTimeCursorRenderer } from './time-cursor/canvas-time-cursor.renderer';
import { TimeCursorController } from './time-cursor/time-cursor.controller';
import { TimeCursorModel } from './time-cursor/time-cursor.model';
import { CanvasTimeRangeRenderer } from './time-range/canvas-time-range.renderer';
import { TimeRangeController } from './time-range/time-range.controller';
import { TimeRangeModel } from './time-range/time-range.model';
import type { TimeRangeRenderGeometry } from './time-range/time-range.types';
import { TimelineCanvasRenderer } from './timeline/timeline-canvas.renderer';
import { TimelineConversationLoader } from './timeline/timeline-conversation.loader';
import { TimelineKeyboardController } from './timeline/timeline-keyboard.controller';
import { TimelineModelStore } from './timeline/timeline-model.store';
import { TimelinePointerController } from './timeline/timeline-pointer.controller';
import type { DragMode } from './timeline/timeline-pointer.controller';
import type { TimelineRenderMetrics } from './timeline/timeline.types';

@Component({
  selector: 'app-time-panel',
  imports: [CommonModule],
  templateUrl: './time-panel.component.html',
  styleUrl: './time-panel.component.sass'
})
export class TimePanelComponent implements AfterViewInit, OnDestroy {
  private readonly chatConversationService = inject(ChatConversationService);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  public readonly conversationSelected = output<string>();
  @ViewChild('timeCanvas') private timeCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('timePanelRoot') private timePanelRootRef?: ElementRef<HTMLDivElement>;
  private resizeObserver?: ResizeObserver;
  private readonly model = new TimelineModelStore();
  private readonly timeRangeModel = new TimeRangeModel();
  private readonly timeCursorModel = new TimeCursorModel();
  private readonly renderer = new TimelineCanvasRenderer(
    this.model,
    this.i18nService,
    () => this.i18nStateService.selectedLanguage(),
    () => {
      const range = this.timeRangeModel.getValue();
      if (!range) {
        return null;
      }

      return {
        startMs: range.startTime.getTime(),
        endMs: range.endTime.getTime()
      };
    },
    () => this.timeCursorModel.getValue()?.conversationName ?? null
  );
  private readonly timeRangeRenderer = new CanvasTimeRangeRenderer(this.model, this.timeRangeModel);
  private readonly timeCursorRenderer = new CanvasTimeCursorRenderer(this.timeCursorModel);
  private readonly keyboardController = new TimelineKeyboardController(
    this.model,
    () => this.getMainAreaMetrics(),
    (fallbackAnchorXPx, mainWidthPx) => this.resolveTimeRangeAwareHorizontalZoomAnchor(fallbackAnchorXPx, mainWidthPx)
  );
  private readonly pointerController = new TimelinePointerController(
    this.model,
    () => this.lastRenderMetrics,
    (rowIndex) => this.onConversationRowClick(rowIndex),
    (fallbackAnchorXPx, mainWidthPx) => this.resolveTimeRangeAwareHorizontalZoomAnchor(fallbackAnchorXPx, mainWidthPx)
  );
  private readonly timeRangeController = new TimeRangeController(this.timeRangeModel, () => this.lastTimeRangeGeometry);
  private readonly timeCursorController = new TimeCursorController(
    this.timeCursorModel,
    this.model,
    () => this.lastRenderMetrics
  );
  private readonly conversationLoader = new TimelineConversationLoader();
  private cleanupModelSubscription?: () => void;
  private cleanupTimeRangeSubscription?: () => void;
  private cleanupTimeCursorSubscription?: () => void;
  private lastRenderMetrics: TimelineRenderMetrics | null = null;
  private lastTimeRangeGeometry: TimeRangeRenderGeometry | null = null;
  private loadingStatus = '';
  private isLoading = true;
  private hasLoadError = false;
  protected statusText = '';
  private readonly summariesEffectRef = effect(
    () => {
      const summariesById = this.chatConversationService.conversationSummaries();
      const summaries = Object.values(summariesById);
      this.applySummariesToTimeline(summaries);
    },
    { allowSignalWrites: true }
  );

  ngAfterViewInit(): void {
    const canvas = this.timeCanvasRef?.nativeElement;
    const panelRoot = this.timePanelRootRef?.nativeElement;

    if (!canvas || !panelRoot) {
      return;
    }

    panelRoot.focus();
    this.loadingStatus = this.i18nService.get(I18N_KEYS.shell.TIME_PANEL_LOADING, this.i18nStateService.selectedLanguage());
    this.statusText = this.loadingStatus;
    this.cleanupModelSubscription = this.model.subscribe(() => {
      this.draw();
    });
    this.cleanupTimeRangeSubscription = this.timeRangeModel.subscribe(() => {
      this.draw();
    });
    this.cleanupTimeCursorSubscription = this.timeCursorModel.subscribe(() => {
      this.draw();
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.syncCanvasSize();
      this.draw();
    });

    this.resizeObserver.observe(panelRoot);
    this.syncCanvasSize();

    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
    panelRoot.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('mousemove', this.onDocumentMouseMove);
    document.addEventListener('mouseup', this.onDocumentMouseUp);

    this.draw();
    queueMicrotask(() => {
      this.syncSharedTimeRangeFilter();
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.cleanupModelSubscription?.();
    this.cleanupTimeRangeSubscription?.();
    this.cleanupTimeCursorSubscription?.();

    const canvas = this.timeCanvasRef?.nativeElement;
    const panelRoot = this.timePanelRootRef?.nativeElement;
    canvas?.removeEventListener('wheel', this.onWheel);
    canvas?.removeEventListener('mousedown', this.onMouseDown);
    canvas?.removeEventListener('mousemove', this.onMouseMove);
    canvas?.removeEventListener('mouseup', this.onMouseUp);
    canvas?.removeEventListener('mouseleave', this.onMouseLeave);
    panelRoot?.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
    document.removeEventListener('mouseup', this.onDocumentMouseUp);
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }

  private syncCanvasSize(): void {
    const canvas = this.timeCanvasRef?.nativeElement;
    const panelRoot = this.timePanelRootRef?.nativeElement;

    if (!canvas || !panelRoot) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const rect = panelRoot.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));
    this.model.setViewport(width, height);
  }

  private draw(): void {
    const canvas = this.timeCanvasRef?.nativeElement;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth));
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight));
    const ratioX = canvas.width / cssWidth;
    const ratioY = canvas.height / cssHeight;

    context.setTransform(ratioX, 0, 0, ratioY, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    this.lastRenderMetrics = this.renderer.render(context, cssWidth, cssHeight);
    const state = this.model.getState();
    if (state.segments.length > 0) {
      this.timeRangeModel.ensureInitialized(state.minTimeMs, state.maxTimeMs);
    }
    this.lastTimeRangeGeometry = this.lastRenderMetrics
      ? this.timeRangeRenderer.render(context, this.lastRenderMetrics)
      : null;
    if (this.lastRenderMetrics) {
      this.timeCursorRenderer.render(context, this.lastRenderMetrics);
    }

    if (this.isLoading || this.hasLoadError) {
      context.fillStyle = 'rgba(255, 255, 255, 0.82)';
      context.fillRect(0, 0, cssWidth, cssHeight);
      context.fillStyle = '#4e5d6d';
      context.font = '12px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(this.statusText, cssWidth / 2, cssHeight / 2);
      context.textAlign = 'start';
    }
  }

  private applySummariesToTimeline(summaries: BackendConversationSummary[]): void {
    if (summaries.length === 0) {
      this.isLoading = true;
      this.hasLoadError = false;
      this.statusText = this.loadingStatus;
      this.draw();
      return;
    }

    try {
      const segments = this.conversationLoader.loadAll(summaries, (loaded, total) => {
        this.isLoading = true;
        this.statusText = `${this.loadingStatus} (${loaded}/${total})`;
      });

      this.model.setSegments(segments);
      this.initializeTimeModeDefaultWindow();
      this.isLoading = false;
      this.hasLoadError = false;
      this.statusText = '';
      this.draw();
    } catch {
      this.isLoading = false;
      this.hasLoadError = true;
      this.statusText = this.i18nService.get(
        I18N_KEYS.shell.TIME_PANEL_ERROR,
        this.i18nStateService.selectedLanguage()
      );
      this.draw();
    }
  }

  private readonly onWheel = (event: WheelEvent): void => {
    this.pointerController.onWheel(event);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.timeRangeController.onMouseDown(event)) {
      this.applyCanvasCursor(event);
      return;
    }

    this.pointerController.onMouseDown(event);
    this.applyCanvasCursor(event);
    this.tryEnablePointerLockForZoom();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    this.timeCursorController.onMouseMove(event);
    this.applyCanvasCursor(event);
    if (this.timeRangeController.onMouseMove(event)) {
      this.syncSharedTimeRangeFilter();
      return;
    }
    this.pointerController.onMouseMove(event);
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.timeRangeController.onMouseUp();
    this.pointerController.onMouseUp(event);
    this.releasePointerLockIfAny();
  };

  private readonly onMouseLeave = (event: MouseEvent): void => {
    this.timeCursorController.onMouseLeave();
    this.timeRangeController.onMouseUp();
    this.pointerController.onMouseUp(event);
    this.releasePointerLockIfAny();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.keyboardController.onKeyDown(event);
  };

  private readonly onDocumentMouseMove = (event: MouseEvent): void => {
    const canvas = this.timeCanvasRef?.nativeElement;

    if (!canvas) {
      return;
    }

    if (this.timeRangeController.isDragging()) {
      const rect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      if (this.timeRangeController.onPointerMove(offsetX)) {
        this.syncSharedTimeRangeFilter();
        return;
      }
    }

    if (document.pointerLockElement !== canvas) {
      return;
    }

    if (this.timeRangeController.onMouseMove(event)) {
      return;
    }
    this.pointerController.onMouseMove(event);
  };

  private readonly onDocumentMouseUp = (): void => {
    const canvas = this.timeCanvasRef?.nativeElement;
    this.timeRangeController.onMouseUp();

    if (!canvas || document.pointerLockElement !== canvas) {
      return;
    }
    this.releasePointerLockIfAny();
  };

  private onConversationRowClick(rowIndex: number): void {
    const segment = this.model.getState().segments[rowIndex];

    if (!segment) {
      return;
    }

    this.conversationSelected.emit(segment.id);
  }

  private getMainAreaMetrics(): { mainWidth: number; mainHeight: number } {
    const metrics = this.lastRenderMetrics;

    if (!metrics) {
      return {
        mainWidth: Math.max(1, this.model.getState().viewportWidth),
        mainHeight: Math.max(1, this.model.getState().viewportHeight)
      };
    }

    return {
      mainWidth: metrics.mainRect.width,
      mainHeight: metrics.mainRect.height
    };
  }

  private tryEnablePointerLockForZoom(): void {
    const canvas = this.timeCanvasRef?.nativeElement;

    if (!canvas) {
      return;
    }

    const dragMode = this.pointerController.getDragMode();

    if (dragMode !== 'h-zoom' && dragMode !== 'v-zoom') {
      return;
    }

    // Pointer Lock gives us effectively infinite drag for wheel-like zoom controls.
    if (document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock();
    }
  }

  private releasePointerLockIfAny(): void {
    const canvas = this.timeCanvasRef?.nativeElement;

    if (canvas && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }

  private applyCanvasCursor(event: MouseEvent): void {
    const canvas = this.timeCanvasRef?.nativeElement;

    if (!canvas) {
      return;
    }

    const dragMode: DragMode = this.pointerController.getDragMode();

    if (dragMode === 'h-zoom') {
      canvas.style.cursor = 'ew-resize';
      return;
    }

    if (dragMode === 'v-zoom') {
      canvas.style.cursor = 'ns-resize';
      return;
    }

    const timeRangeCursor = this.timeRangeController.getCursor(event);
    if (timeRangeCursor) {
      canvas.style.cursor = timeRangeCursor;
      return;
    }

    canvas.style.cursor = this.pointerController.getCursor(event);
  }

  private initializeTimeModeDefaultWindow(): void {
    const state = this.model.getState();
    if (state.segments.length === 0) {
      return;
    }

    const { mainWidth } = this.getMainAreaMetrics();
    const safeMainWidth = Math.max(1, mainWidth);
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1_000;
    const defaultStartMs = now - oneWeekMs;
    const defaultEndMs = now;

    this.timeRangeModel.setRange(defaultStartMs, defaultEndMs);
    this.model.setHorizontalWindow(defaultStartMs, defaultEndMs, safeMainWidth);
  }

  private syncSharedTimeRangeFilter(): void {
    const range = this.timeRangeModel.getValue();

    if (!range) {
      this.chatConversationService.setTimeRangeFilter(null);
      return;
    }

    this.chatConversationService.setTimeRangeFilter({
      startMs: range.startTime.getTime(),
      endMs: range.endTime.getTime()
    });
  }

  private resolveTimeRangeAwareHorizontalZoomAnchor(
    fallbackAnchorXPx: number,
    mainWidthPx: number
  ): { anchorXPx: number; anchorTimeMs?: number } {
    const range = this.timeRangeModel.getValue();

    if (!range || mainWidthPx <= 0) {
      return { anchorXPx: fallbackAnchorXPx };
    }

    const rangeStartMs = range.startTime.getTime();
    const rangeEndMs = range.endTime.getTime();
    const rangeDurationMs = Math.max(1_000, rangeEndMs - rangeStartMs);
    const rangeMidpointMs = rangeStartMs + rangeDurationMs / 2;

    // Keep zoom focused on the selected time range by pinning its midpoint to the canvas center.
    // This enforces that zoom translates toward the selected window instead of the current viewport center.
    return {
      anchorXPx: mainWidthPx / 2,
      anchorTimeMs: rangeMidpointMs
    };
  }
}
