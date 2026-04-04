export enum MessageDirection {
  Incoming = 'incoming',
  Outgoing = 'outgoing',
  Unknown = 'unknown'
}

export class NormalizedConversationCsvFields {
  constructor(
    public readonly chatSession: string | null,
    public readonly messageDate: string | null,
    public readonly sentDate: string | null,
    public readonly messageType: string | null,
    public readonly senderId: string | null,
    public readonly senderName: string | null,
    public readonly status: string | null,
    public readonly forwarded: string | null,
    public readonly replyTo: string | null,
    public readonly text: string | null,
    public readonly reactions: string | null,
    public readonly attachment: string | null,
    public readonly attachmentType: string | null,
    public readonly attachmentInfo: string | null
  ) {}
}

export class RawConversationMessage {
  constructor(
    public readonly conversationId: string,
    public readonly externalId: string,
    public readonly sentAt: Date | null,
    public readonly sender: string | null,
    public readonly text: string,
    public readonly sourceFile: string,
    public readonly rowNumber: number,
    public readonly direction: MessageDirection,
    public readonly normalizedFields: NormalizedConversationCsvFields
  ) {}
}

export class CleanedConversationMessage {
  constructor(
    public readonly conversationId: string,
    public readonly externalId: string,
    public readonly sentAt: Date | null,
    public readonly sender: string | null,
    public readonly cleanedText: string,
    public readonly sourceFile: string,
    public readonly rowNumber: number,
    public readonly direction: MessageDirection,
    public readonly normalizedFields: NormalizedConversationCsvFields
  ) {}
}

export class StructuredConversationTurn {
  constructor(
    public readonly turnId: string,
    public readonly conversationId: string,
    public readonly sourceFile: string,
    public readonly question: string,
    public readonly answer: string,
    public readonly startedAt: Date | null,
    public readonly endedAt: Date | null,
    public readonly messageIds: string[]
  ) {}
}

export class SemanticConversationChunk {
  constructor(
    public readonly chunkId: string,
    public readonly turnId: string,
    public readonly conversationId: string,
    public readonly sourceFile: string,
    public readonly content: string,
    public readonly metadata: Record<string, unknown>
  ) {}
}
