import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, ViewChild, input, output } from '@angular/core';

@Component({
  selector: 'app-contact-delete-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact-delete-confirm-modal.component.html',
  styleUrl: './contact-delete-confirm-modal.component.sass'
})
export class ContactDeleteConfirmModalComponent implements AfterViewInit {
  public readonly title = input<string>('');
  public readonly message = input<string>('');
  public readonly confirmLabel = input<string>('');
  public readonly cancelLabel = input<string>('');
  public readonly confirmAriaLabel = input<string>('');
  public readonly cancelAriaLabel = input<string>('');

  public readonly confirm = output<void>();
  public readonly cancel = output<void>();

  @ViewChild('dialogRoot')
  private dialogRootRef?: ElementRef<HTMLDivElement>;

  public ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.dialogRootRef?.nativeElement.focus();
    });
  }

  protected onBackdropClick(): void {
    this.cancel.emit();
  }

  protected onDialogClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel.emit();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.confirm.emit();
    }
  }

  protected onConfirmClick(): void {
    this.confirm.emit();
  }

  protected onCancelClick(): void {
    this.cancel.emit();
  }
}
