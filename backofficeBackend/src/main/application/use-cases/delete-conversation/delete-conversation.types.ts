export type DeleteConversationCommand = {
  conversationId: string;
};

export type DeleteConversationResult = {
  ok: true;
  conversationId: string;
  csvMoved: boolean;
  csvFromPath: string | null;
  csvToPath: string | null;
  embeddingsDeleted: number;
  conversationDeleted: boolean;
};
