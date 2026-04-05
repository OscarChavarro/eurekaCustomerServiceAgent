export type ConversationSummaryResult = {
  id: string;
  msg: string | null;
  firstMessageDate: string | null;
  lastMessageDate: string | null;
};

export type GetConversationIdsResult = ConversationSummaryResult[];
