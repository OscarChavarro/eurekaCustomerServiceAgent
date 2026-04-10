import { TimeCursorModel } from './time-cursor.model';
import type { TimelineRenderMetrics } from '../timeline/timeline.types';

export class CanvasTimeCursorRenderer {
  constructor(private readonly model: TimeCursorModel) {}

  public render(context: CanvasRenderingContext2D, metrics: TimelineRenderMetrics): void {
    const cursor = this.model.getValue();

    if (!cursor) {
      return;
    }

    const x = this.clamp(cursor.x, metrics.mainRect.x, metrics.mainRect.x + metrics.mainRect.width);

    this.drawVerticalLine(context, x, metrics);
    this.drawTimeLabel(context, x, metrics, cursor.time);

    if (cursor.conversationLabel) {
      this.drawConversationLabel(
        context,
        cursor.x + 12,
        cursor.y + 16,
        cursor.conversationLabel,
        metrics.mainRect
      );
    }
  }

  private drawVerticalLine(context: CanvasRenderingContext2D, x: number, metrics: TimelineRenderMetrics): void {
    context.strokeStyle = '#8896a3';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(Math.round(x) + 0.5, metrics.rulerRect.y);
    context.lineTo(Math.round(x) + 0.5, metrics.mainRect.y + metrics.mainRect.height);
    context.stroke();
  }

  private drawTimeLabel(
    context: CanvasRenderingContext2D,
    x: number,
    metrics: TimelineRenderMetrics,
    time: Date
  ): void {
    const label = this.formatTimeLabel(time);
    context.font = '11px system-ui, sans-serif';
    context.textBaseline = 'middle';
    const textWidth = context.measureText(label).width;
    const boxWidth = Math.ceil(textWidth + 10);
    const boxHeight = 16;
    const leftLimit = metrics.rulerRect.x;
    const rightLimit = metrics.rulerRect.x + metrics.rulerRect.width - boxWidth;
    const boxX = this.clamp(x - boxWidth / 2, leftLimit, rightLimit);
    const boxY = metrics.rulerRect.y + 2;

    context.fillStyle = 'rgba(17, 27, 33, 0.88)';
    context.fillRect(boxX, boxY, boxWidth, boxHeight);
    context.fillStyle = '#ffffff';
    context.fillText(label, boxX + 5, boxY + boxHeight / 2);
  }

  private drawConversationLabel(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    conversationLabel: string,
    mainRect: { x: number; y: number; width: number; height: number }
  ): void {
    const label = conversationLabel;
    context.font = '11px system-ui, sans-serif';
    context.textBaseline = 'middle';
    const textWidth = context.measureText(label).width;
    const boxWidth = Math.ceil(textWidth + 10);
    const boxHeight = 16;
    const minX = mainRect.x;
    const maxX = mainRect.x + mainRect.width - boxWidth;
    const minY = mainRect.y;
    const maxY = mainRect.y + mainRect.height - boxHeight;
    const boxX = this.clamp(x, minX, maxX);
    const boxY = this.clamp(y, minY, maxY);

    context.fillStyle = 'rgba(32, 44, 51, 0.92)';
    context.fillRect(boxX, boxY, boxWidth, boxHeight);
    context.fillStyle = '#e7edf2';
    context.fillText(label, boxX + 5, boxY + boxHeight / 2);
  }

  private formatTimeLabel(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}.${seconds}`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
