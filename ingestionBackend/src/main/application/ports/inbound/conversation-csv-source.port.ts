export interface ConversationCsvRawRecord {
  readonly sourceFile: string;
  readonly rowNumber: number;
  readonly fields: Record<string, string>;
}

export interface ConversationCsvSourcePort {
  readFromPath(path: string): Promise<ConversationCsvRawRecord[]>;
}
