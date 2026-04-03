export interface ConversationCsvRawRecord {
  readonly sourceFile: string;
  readonly rowNumber: number;
  readonly fields: Record<string, string>;
}

export interface ConversationCsvSourcePort {
  readFromFolder(folderPath: string): Promise<ConversationCsvRawRecord[]>;
}
