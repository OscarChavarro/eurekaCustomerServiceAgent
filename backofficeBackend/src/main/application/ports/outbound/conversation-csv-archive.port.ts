export type ConversationCsvArchiveResult = {
  moved: boolean;
  fromPath: string | null;
  toPath: string | null;
};

export interface ConversationCsvArchivePort {
  moveToDisabledFolderIfCsv(sourceFilePath: string | null): Promise<ConversationCsvArchiveResult>;
}
