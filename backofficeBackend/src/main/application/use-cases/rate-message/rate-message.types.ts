import type {
  RevisionMutationValue,
  RevisionStage
} from '../../ports/outbound/message-rating-repository.port';

export type RateMessageCommand = {
  conversationId: string;
  stage: RevisionStage;
  stageId: string;
  rating: RevisionMutationValue;
};

export type RateMessageResult = {
  ok: true;
  conversationId: string;
  stage: RevisionStage;
  stageId: string;
  rating: RevisionMutationValue;
  ratedAt: string;
};
