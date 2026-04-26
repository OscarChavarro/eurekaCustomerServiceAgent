export enum CustomerStage {
  UNDEFINED = 'UNDEFINED',
  NEW_LEAD = 'NEW_LEAD',
  ASKING_INFO = 'ASKING_INFO',
  PRICE_CHECK = 'PRICE_CHECK',
  READY_TO_BUY = 'READY_TO_BUY',
  WAITING_PAYMENT = 'WAITING_PAYMENT',
  WAITING_PHOTO = 'WAITING_PHOTO',
  MOCKUP_SENT = 'MOCKUP_SENT',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  IN_PRODUCTION = 'IN_PRODUCTION',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  POST_DELIVERY = 'POST_DELIVERY',
  SUPPORT_ISSUE = 'SUPPORT_ISSUE'
}

export type PreviousConversationStage = {
  stage: CustomerStage;
  changedAt: string;
  rawMessageIds: string[];
};

export type GetConversationStageCommand = {
  conversationId: string;
};

export type GetConversationStageResult = {
  conversationId: string;
  currentStage: CustomerStage;
  previousStage: PreviousConversationStage[];
};
