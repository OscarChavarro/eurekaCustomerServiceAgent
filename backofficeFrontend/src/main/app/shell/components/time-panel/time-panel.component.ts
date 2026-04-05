import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConversationsApiService } from '../../../core/api/services/conversations-api.service';
import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';
import { TimelineCanvasRenderer } from './timeline-canvas.renderer';
import { TimelineConversationLoader } from './timeline-conversation.loader';
import { TimelineKeyboardController } from './timeline-keyboard.controller';
import { TimelineModelStore } from './timeline-model.store';
import { TimelinePointerController } from './timeline-pointer.controller';
import type { TimelineRenderMetrics } from './timeline.types';

@Component({
  selector: 'app-time-panel',
  imports: [CommonModule],
  templateUrl: './time-panel.component.html',
  styleUrl: './time-panel.component.sass'
})
export class TimePanelComponent implements AfterViewInit, OnDestroy {
  private readonly conversationsApiService = inject(ConversationsApiService);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  public readonly conversationSelected = output<string>();
  @ViewChild('timeCanvas') private timeCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('timePanelRoot') private timePanelRootRef?: ElementRef<HTMLDivElement>;
  private resizeObserver?: ResizeObserver;
  private readonly model = new TimelineModelStore();
  private readonly renderer = new TimelineCanvasRenderer(
    this.model,
    this.i18nService,
    () => this.i18nStateService.selectedLanguage()
  );
  private readonly keyboardController = new TimelineKeyboardController(this.model, () => this.getMainAreaMetrics());
  private readonly pointerController = new TimelinePointerController(
    this.model,
    () => this.lastRenderMetrics,
    (rowIndex) => this.onConversationRowClick(rowIndex)
  );
  private readonly conversationLoader = new TimelineConversationLoader(this.conversationsApiService);
  private cleanupModelSubscription?: () => void;
  private lastRenderMetrics: TimelineRenderMetrics | null = null;
  private loadingStatus = '';
  private isLoading = true;
  private hasLoadError = false;
  protected statusText = '';

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

    this.draw();
    void this.loadConversations();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.cleanupModelSubscription?.();

    const canvas = this.timeCanvasRef?.nativeElement;
    const panelRoot = this.timePanelRootRef?.nativeElement;
    canvas?.removeEventListener('wheel', this.onWheel);
    canvas?.removeEventListener('mousedown', this.onMouseDown);
    canvas?.removeEventListener('mousemove', this.onMouseMove);
    canvas?.removeEventListener('mouseup', this.onMouseUp);
    canvas?.removeEventListener('mouseleave', this.onMouseLeave);
    panelRoot?.removeEventListener('keydown', this.onKeyDown);
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

  private async loadConversations(): Promise<void> {
    try {
      const segments = await this.conversationLoader.loadAll((loaded, total) => {
        this.isLoading = true;
        this.statusText = `${this.loadingStatus} (${loaded}/${total})`;
        this.draw();
      });

      this.model.setSegments(segments);
      this.isLoading = false;
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
    this.pointerController.onMouseDown(event);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    this.pointerController.onMouseMove(event);
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.pointerController.onMouseUp(event);
  };

  private readonly onMouseLeave = (event: MouseEvent): void => {
    this.pointerController.onMouseUp(event);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.keyboardController.onKeyDown(event);
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
}
