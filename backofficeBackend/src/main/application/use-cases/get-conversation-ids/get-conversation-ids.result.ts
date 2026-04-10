export type ConversationSummaryResult = {
  id: string;
  contactName: string | null;
  filePattern: string | null;
  msg: string | null;
  firstMessageDate: string | null;
  lastMessageDate: string | null;
};

export type GetConversationIdsResult = ConversationSummaryResult[];
