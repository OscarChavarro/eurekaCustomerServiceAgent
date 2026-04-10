export interface ConversationCsvRawRecord {
  readonly sourceFile: string;
  readonly filePattern?: string | null;
  readonly rowNumber: number;
  readonly conversationId?: string;
  readonly contactName?: string | null;
  readonly fields: Record<string, string>;
}

export interface ConversationCsvSourcePort {
  readFromPath(path: string): Promise<ConversationCsvRawRecord[]>;
}
