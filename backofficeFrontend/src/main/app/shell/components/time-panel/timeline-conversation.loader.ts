import { firstValueFrom } from 'rxjs';
import {
  ConversationsApiService,
  type BackendConversationSummary,
  type BackendConversationDocument
} from '../../../core/api/services/conversations-api.service';
import type { TimelineConversationSegment } from './timeline.types';

type LoadProgressCallback = (loaded: number, total: number) => void;

export class TimelineConversationLoader {
  constructor(private readonly conversationsApiService: ConversationsApiService) {}

  public async loadAll(progressCallback?: LoadProgressCallback): Promise<TimelineConversationSegment[]> {
    const summaries = await firstValueFrom(this.conversationsApiService.getConversationIds());
    const total = summaries.length;
    const segments: TimelineConversationSegment[] = [];
    const concurrency = Math.min(8, Math.max(1, total));
    let nextIndex = 0;
    let loadedCount = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (nextIndex < total) {
        const index = nextIndex;
        nextIndex += 1;
        const summary = summaries[index];

        if (!summary) {
          continue;
        }

        const segment = await this.loadOneConversation(summary);
        segments.push(segment);
        loadedCount += 1;

        if (progressCallback && (loadedCount % 25 === 0 || loadedCount === total)) {
          progressCallback(loadedCount, total);
        }
      }
    });

    await Promise.all(workers);

    return segments.sort((left, right) =>
      left.startMs === right.startMs
        ? left.id.localeCompare(right.id)
        : left.startMs - right.startMs
    );
  }

  private async loadOneConversation(summary: BackendConversationSummary): Promise<TimelineConversationSegment> {
    const fallbackTimestamp = this.parseDate(summary.date) ?? Date.now();

    try {
      const document = await firstValueFrom(this.conversationsApiService.getConversationById(summary.id));
      const { startMs, endMs } = this.resolveConversationBounds(document, fallbackTimestamp);

      return {
        id: summary.id,
        startMs,
        endMs,
        color: this.buildSegmentColor(summary.id)
      };
    } catch {
      return {
        id: summary.id,
        startMs: fallbackTimestamp,
        endMs: fallbackTimestamp + 60_000,
        color: this.buildSegmentColor(summary.id)
      };
    }
  }

  private resolveConversationBounds(
    document: BackendConversationDocument,
    fallbackTimestamp: number
  ): { startMs: number; endMs: number } {
    const rawMessages = document.rawMessages ?? [];
    const timestamps = rawMessages
      .map((rawMessage) => this.parseDate(rawMessage.sentAt))
      .filter((timestamp): timestamp is number => typeof timestamp === 'number');

    if (timestamps.length === 0) {
      return {
        startMs: fallbackTimestamp,
        endMs: fallbackTimestamp + 60_000
      };
    }

    const startMs = Math.min(...timestamps);
    const endMs = Math.max(...timestamps);

    return {
      startMs,
      endMs: Math.max(startMs + 1_000, endMs)
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
