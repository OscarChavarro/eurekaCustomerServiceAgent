import {
  type BackendConversationSummary
} from '../../../core/api/services/conversations-api.service';
import type { TimelineConversationSegment } from './timeline.types';

type LoadProgressCallback = (loaded: number, total: number) => void;

export class TimelineConversationLoader {
  public loadAll(
    summaries: BackendConversationSummary[],
    progressCallback?: LoadProgressCallback
  ): TimelineConversationSegment[] {
    const total = summaries.length;
    const segments = summaries.map((summary) => this.toSegment(summary));

    if (progressCallback) {
      progressCallback(total, total);
    }

    return segments.sort((left, right) =>
      left.startMs === right.startMs
        ? left.id.localeCompare(right.id)
        : left.startMs - right.startMs
    );
  }

  private toSegment(summary: BackendConversationSummary): TimelineConversationSegment {
    const now = Date.now();
    const firstDate = this.parseDate(summary.firstMessageDate);
    const lastDate = this.parseDate(summary.lastMessageDate);
    const startMs = firstDate ?? lastDate ?? now;
    const endMs = Math.max(startMs + 1_000, lastDate ?? startMs + 60_000);

    return {
      id: summary.id,
      startMs,
      endMs,
      color: this.buildSegmentColor(summary.id)
    };
  }

  private parseDate(rawDate: string | null | undefined): number | null {
    if (!rawDate) {
      return null;
    }

    const normalizedDate =
      rawDate.includes(' ') && !rawDate.includes('T') ? rawDate.replace(' ', 'T') : rawDate;
    const timestamp = new Date(normalizedDate).getTime();

    return Number.isNaN(timestamp) ? null : timestamp;
  }

  private buildSegmentColor(conversationId: string): string {
    const hash = [...conversationId].reduce((accumulator, char) => {
      return (accumulator * 31 + char.charCodeAt(0)) % 360;
    }, 0);

    return `hsl(${(hash + 190) % 360} 65% 74%)`;
  }
}
