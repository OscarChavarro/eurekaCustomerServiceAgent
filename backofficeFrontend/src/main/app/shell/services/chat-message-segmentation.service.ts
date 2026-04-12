import { Injectable } from '@angular/core';

export type ChatMessageTextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'phone'; value: string };

@Injectable({ providedIn: 'root' })
export class ChatMessageSegmentationService {
  private readonly textSegmentsCache = new Map<string, ChatMessageTextSegment[]>();

  public getSegments(text: string | undefined): ChatMessageTextSegment[] {
    if (!text) {
      return [];
    }

    const cached = this.textSegmentsCache.get(text);
    if (cached) {
      return cached;
    }

    const segments = this.splitTextIntoSegments(text);
    this.textSegmentsCache.set(text, segments);

    return segments;
  }

  private splitTextIntoSegments(text: string): ChatMessageTextSegment[] {
    const pattern = /\b((?:https?:\/\/|www\.)[^\s<]+)|(\+\d[\d\s().-]{4,}\d)/gi;
    const segments: ChatMessageTextSegment[] = [];
    let currentIndex = 0;

    for (const match of text.matchAll(pattern)) {
      const fullMatch = match[0];
      const startIndex = match.index ?? 0;

      if (startIndex > currentIndex) {
        segments.push({
          type: 'text',
          value: text.slice(currentIndex, startIndex)
        });
      }

      const urlCandidate = match[1];
      const phoneCandidate = match[2];

      if (urlCandidate) {
        const normalizedUrl = this.normalizeMatchedUrl(urlCandidate);
        const trailingSuffix = urlCandidate.slice(normalizedUrl.length);
        const href = normalizedUrl.startsWith('http') ? normalizedUrl : `https://${normalizedUrl}`;

        segments.push({
          type: 'link',
          value: normalizedUrl,
          href
        });

        if (trailingSuffix) {
          segments.push({
            type: 'text',
            value: trailingSuffix
          });
        }
      } else if (phoneCandidate) {
        segments.push({
          type: 'phone',
          value: this.normalizeMatchedPhone(phoneCandidate)
        });
      }

      currentIndex = startIndex + fullMatch.length;
    }

    if (currentIndex < text.length) {
      segments.push({
        type: 'text',
        value: text.slice(currentIndex)
      });
    }

    return segments;
  }

  private normalizeMatchedUrl(matchedUrl: string): string {
    return matchedUrl.replace(/[),.;!?]+$/, '');
  }

  private normalizeMatchedPhone(matchedPhone: string): string {
    return matchedPhone.replace(/[),.;!?]+$/, '');
  }
}

