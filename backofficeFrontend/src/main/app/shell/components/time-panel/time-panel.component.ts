import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-time-panel',
  imports: [CommonModule],
  templateUrl: './time-panel.component.html',
  styleUrl: './time-panel.component.sass'
})
export class TimePanelComponent implements AfterViewInit, OnDestroy {
  @ViewChild('timeCanvas') private timeCanvasRef?: ElementRef<HTMLCanvasElement>;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    const canvas = this.timeCanvasRef?.nativeElement;

    if (!canvas) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.drawCrossLines();
    });

    this.resizeObserver.observe(canvas);
    this.drawCrossLines();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private drawCrossLines(): void {
    const canvas = this.timeCanvasRef?.nativeElement;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    context.strokeStyle = '#000000';
    context.lineWidth = 1;

    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(width, height);
    context.moveTo(width, 0);
    context.lineTo(0, height);
    context.stroke();
  }
}
