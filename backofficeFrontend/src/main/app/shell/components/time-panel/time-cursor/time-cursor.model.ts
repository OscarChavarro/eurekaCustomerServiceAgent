import type { TimeCursorValue } from './time-cursor.types';

export class TimeCursorModel {
  private value: TimeCursorValue | null = null;
  private listeners = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getValue(): TimeCursorValue | null {
    return this.value;
  }

  public setValue(value: TimeCursorValue | null): void {
    if (this.areEqual(this.value, value)) {
      return;
    }

    this.value = value;
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private areEqual(left: TimeCursorValue | null, right: TimeCursorValue | null): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return (
      left.time.getTime() === right.time.getTime() &&
      left.x === right.x &&
      left.y === right.y &&
      left.conversationName === right.conversationName
    );
  }
}
