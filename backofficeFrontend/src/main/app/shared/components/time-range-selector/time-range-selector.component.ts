import { CommonModule } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getTimeRangeSelectorText } from './time-range-selector.i18n';

export type TimeRangeSelection = {
  startTime: Date;
  endTime: Date;
};

type RelativePresetKey =
  | 'lastMinute'
  | 'lastHour'
  | 'lastDay'
  | 'lastWeek'
  | 'lastMonth'
  | 'last3Months'
  | 'lastYear';

type CalendarDayCell = {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isInRange: boolean;
};

@Component({
  selector: 'app-time-range-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './time-range-selector.component.html',
  styleUrl: './time-range-selector.component.sass'
})
export class TimeRangeSelectorComponent {
  public readonly open = input<boolean>(false);
  public readonly language = input<string>('en');
  public readonly initialRange = input<TimeRangeSelection | null>(null);

  public readonly closed = output<void>();
  public readonly applied = output<TimeRangeSelection>();

  protected readonly text = computed(() => getTimeRangeSelectorText(this.language()));
  protected readonly monthNames = computed(() => this.buildMonthNames(this.language()));
  protected readonly visibleMonth = new Date();
  protected readonly fromInput = '';
  protected readonly toInput = '';

  private draftStart: Date | null = null;
  private draftEnd: Date | null = null;

  constructor() {
    const now = new Date();
    this.visibleMonth.setUTCFullYear(now.getUTCFullYear(), now.getUTCMonth(), 1);
    this.visibleMonth.setUTCHours(0, 0, 0, 0);
  }

  protected get years(): number[] {
    const currentYear = new Date().getUTCFullYear();
    const start = currentYear - 15;
    return Array.from({ length: 31 }, (_, index) => start + index);
  }

  protected get selectedMonth(): number {
    return this.visibleMonth.getUTCMonth();
  }

  protected get selectedYear(): number {
    return this.visibleMonth.getUTCFullYear();
  }

  protected get calendarCells(): CalendarDayCell[] {
    this.ensureDraftRangeInitialized();

    const firstDayOfMonth = new Date(Date.UTC(this.selectedYear, this.selectedMonth, 1));
    const firstWeekdayIndex = (firstDayOfMonth.getUTCDay() + 6) % 7;
    const startDate = new Date(firstDayOfMonth);
    startDate.setUTCDate(firstDayOfMonth.getUTCDate() - firstWeekdayIndex);

    const cells: CalendarDayCell[] = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(startDate);
      date.setUTCDate(startDate.getUTCDate() + index);
      date.setUTCHours(0, 0, 0, 0);

      const isStart = this.draftStart ? this.isSameUtcDay(date, this.draftStart) : false;
      const isEnd = this.draftEnd ? this.isSameUtcDay(date, this.draftEnd) : false;
      const isInRange = this.isDateInRange(date, this.draftStart, this.draftEnd);

      cells.push({
        date,
        dayNumber: date.getUTCDate(),
        isCurrentMonth: date.getUTCMonth() === this.selectedMonth,
        isRangeStart: isStart,
        isRangeEnd: isEnd,
        isInRange
      });
    }

    return cells;
  }

  protected get fromInputValue(): string {
    this.ensureDraftRangeInitialized();
    return this.formatDateTime(this.draftStart ?? new Date());
  }

  protected get toInputValue(): string {
    this.ensureDraftRangeInitialized();
    return this.formatDateTime(this.draftEnd ?? new Date());
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }

  protected onDialogClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected goToPreviousMonth(): void {
    this.visibleMonth.setUTCMonth(this.visibleMonth.getUTCMonth() - 1, 1);
  }

  protected goToNextMonth(): void {
    this.visibleMonth.setUTCMonth(this.visibleMonth.getUTCMonth() + 1, 1);
  }

  protected onMonthChange(rawMonth: string): void {
    const month = Number(rawMonth);
    if (!Number.isInteger(month) || month < 0 || month > 11) {
      return;
    }

    this.visibleMonth.setUTCMonth(month, 1);
  }

  protected onYearChange(rawYear: string): void {
    const year = Number(rawYear);
    if (!Number.isInteger(year)) {
      return;
    }

    this.visibleMonth.setUTCFullYear(year, this.visibleMonth.getUTCMonth(), 1);
  }

  protected onDayClick(cell: CalendarDayCell): void {
    const selected = new Date(cell.date);

    if (!this.draftStart || (this.draftStart && this.draftEnd)) {
      this.draftStart = selected;
      this.draftStart.setUTCHours(0, 0, 0, 0);
      this.draftEnd = null;
      return;
    }

    const currentStart = this.draftStart.getTime();
    const selectedTime = selected.getTime();

    if (selectedTime < currentStart) {
      this.draftEnd = new Date(this.draftStart);
      this.draftEnd.setUTCHours(23, 59, 59, 999);
      this.draftStart = selected;
      this.draftStart.setUTCHours(0, 0, 0, 0);
      return;
    }

    this.draftEnd = selected;
    this.draftEnd.setUTCHours(23, 59, 59, 999);
  }

  protected onFromInputChange(rawValue: string): void {
    const parsed = this.parseDateTime(rawValue);
    if (!parsed) {
      return;
    }

    this.ensureDraftRangeInitialized();
    this.draftStart = parsed;
    if (!this.draftEnd || this.draftEnd.getTime() < this.draftStart.getTime()) {
      this.draftEnd = new Date(this.draftStart);
    }
  }

  protected onToInputChange(rawValue: string): void {
    const parsed = this.parseDateTime(rawValue);
    if (!parsed) {
      return;
    }

    this.ensureDraftRangeInitialized();
    this.draftEnd = parsed;
    if (!this.draftStart || this.draftStart.getTime() > this.draftEnd.getTime()) {
      this.draftStart = new Date(this.draftEnd);
    }
  }

  protected applyRelativePreset(preset: RelativePresetKey): void {
    const end = new Date();
    const start = new Date(end);

    if (preset === 'lastMinute') {
      start.setUTCMinutes(start.getUTCMinutes() - 1);
    } else if (preset === 'lastHour') {
      start.setUTCHours(start.getUTCHours() - 1);
    } else if (preset === 'lastDay') {
      start.setUTCDate(start.getUTCDate() - 1);
    } else if (preset === 'lastWeek') {
      start.setUTCDate(start.getUTCDate() - 7);
    } else if (preset === 'lastMonth') {
      start.setUTCMonth(start.getUTCMonth() - 1);
    } else if (preset === 'last3Months') {
      start.setUTCMonth(start.getUTCMonth() - 3);
    } else if (preset === 'lastYear') {
      start.setUTCFullYear(start.getUTCFullYear() - 1);
    }

    this.draftStart = start;
    this.draftEnd = end;
    this.visibleMonth.setUTCFullYear(start.getUTCFullYear(), start.getUTCMonth(), 1);
  }

  protected onCancel(): void {
    this.closed.emit();
  }

  protected onApply(): void {
    this.ensureDraftRangeInitialized();

    const start = this.draftStart ?? new Date();
    const end = this.draftEnd ?? start;
    const normalizedStart = start.getTime() <= end.getTime() ? start : end;
    const normalizedEnd = end.getTime() >= start.getTime() ? end : start;

    this.applied.emit({
      startTime: new Date(normalizedStart),
      endTime: new Date(normalizedEnd)
    });
  }

  private ensureDraftRangeInitialized(): void {
    if (this.draftStart && this.draftEnd) {
      return;
    }

    const inputRange = this.initialRange();
    if (inputRange) {
      this.draftStart = new Date(inputRange.startTime);
      this.draftEnd = new Date(inputRange.endTime);
      this.visibleMonth.setUTCFullYear(this.draftStart.getUTCFullYear(), this.draftStart.getUTCMonth(), 1);
      return;
    }

    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setUTCDate(oneWeekAgo.getUTCDate() - 7);

    this.draftStart = oneWeekAgo;
    this.draftEnd = now;
    this.visibleMonth.setUTCFullYear(oneWeekAgo.getUTCFullYear(), oneWeekAgo.getUTCMonth(), 1);
  }

  private buildMonthNames(language: string): string[] {
    const locale = language === 'es' ? 'es-ES' : 'en-US';
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const monthDate = new Date(Date.UTC(2024, monthIndex, 1));
      return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(monthDate);
    });
  }

  private isDateInRange(date: Date, start: Date | null, end: Date | null): boolean {
    if (!start) {
      return false;
    }

    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();

    const startDay = new Date(start);
    startDay.setUTCHours(0, 0, 0, 0);

    if (!end) {
      return dayStartMs === startDay.getTime();
    }

    const endDay = new Date(end);
    endDay.setUTCHours(0, 0, 0, 0);

    return dayStartMs >= startDay.getTime() && dayStartMs <= endDay.getTime();
  }

  private isSameUtcDay(left: Date, right: Date): boolean {
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate()
    );
  }

  private formatDateTime(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');
    const seconds = String(value.getUTCSeconds()).padStart(2, '0');
    const millis = String(value.getUTCMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
  }

  private parseDateTime(value: string): Date | null {
    const match = value
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);

    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const millisecond = Number(match[7]);

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour > 23 ||
      minute > 59 ||
      second > 59 ||
      millisecond > 999
    ) {
      return null;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
