import { CommonModule } from '@angular/common';
import { Component, HostListener, input, signal } from '@angular/core';

@Component({
  selector: 'app-image',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image.component.html',
  styleUrl: './image.component.sass'
})
export class ImageComponent {
  public readonly mediaUrl = input<string>('');
  public readonly alt = input<string>('attachment image');
  protected readonly isZoomOpen = signal<boolean>(false);

  protected openZoom(): void {
    const mediaUrl = this.mediaUrl().trim();
    if (!mediaUrl) {
      return;
    }

    this.isZoomOpen.set(true);
  }

  protected closeZoom(): void {
    this.isZoomOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscapePressed(): void {
    if (!this.isZoomOpen()) {
      return;
    }

    this.closeZoom();
  }
}
