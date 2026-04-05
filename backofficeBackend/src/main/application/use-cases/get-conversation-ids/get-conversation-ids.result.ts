export type ConversationSummaryResult = {
  id: string;
  msg: string | null;
  date: string | null;
};

export type GetConversationIdsResult = ConversationSummaryResult[];
