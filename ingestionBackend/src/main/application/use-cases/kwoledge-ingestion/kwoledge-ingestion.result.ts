export class KwoledgeIngestionMessagesBreakdown {
  constructor(
    public readonly totalMessages: number,
    public readonly sent: number,
    public readonly received: number,
    public readonly withAssociatedMedia: number
  ) {}
}

export class KwoledgeIngestionLimits {
  constructor(
    public readonly minDate: string | null,
    public readonly maxDate: string | null,
    public readonly conversationWithMostMessages: string | null
  ) {}
}

export class KwoledgeIngestionResult {
  constructor(
    public readonly folderPath: string,
    public readonly processedFiles: number,
    public readonly indexedMessages: number,
    public readonly skippedMessages: number,
    public readonly messagesBreakdown: KwoledgeIngestionMessagesBreakdown,
    public readonly limits: KwoledgeIngestionLimits
  ) {}
}
