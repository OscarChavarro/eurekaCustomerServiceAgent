import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

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
}
