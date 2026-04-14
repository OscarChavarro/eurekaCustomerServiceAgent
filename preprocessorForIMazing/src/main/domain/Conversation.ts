export interface CsvRecord {
  [key: string]: string;
}

export interface ConversationMapping {
  originalBaseName: string;
  normalizedBaseName: string;
  phoneNumber: string;
  csvFileName: string;
}
