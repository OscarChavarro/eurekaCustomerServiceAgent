export enum CustomerStage {
  UNIDENTIFIED = 'UNIDENTIFIED',
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
  SUPPORT_ISSUE = 'SUPPORT_ISSUE',
  UNSOLICITED_SELLER = 'UNSOLICITED_SELLER',
  BRAND_COUNTERFEIT = 'BRAND_COUNTERFEIT'
}

export type PreviousConversationStage = {
  stage: CustomerStage;
  fromMessageId: string;
  toMessageId: string;
  startDate: string;
  endDate: string;
};

export enum ContactClassificationType {
  PROSPECT = 'PROSPECT',
  CUSTOMER = 'CUSTOMER',
  UNKNOWN = 'UNKNOWN'
}

export type StageClassificationSource = {
  contactType: ContactClassificationType;
  externalId?: string;
};

export enum ConversationInconsistencyType {
  STAGE_MISMATCH = 'STAGE_MISMATCH',
  LABEL_CONFLICT = 'LABEL_CONFLICT'
}

export type ConversationInconsistency = {
  type: ConversationInconsistencyType;
  message: string;
};

export type ConversationStage = {
  conversationId: string;
  currentStage: CustomerStage;
  previousStages: PreviousConversationStage[];
  lastStageUpdate: string;
  summary: string;
  detectedSignals: string[];
  classificationSource: StageClassificationSource;
  inconsistencies: ConversationInconsistency[];
};
