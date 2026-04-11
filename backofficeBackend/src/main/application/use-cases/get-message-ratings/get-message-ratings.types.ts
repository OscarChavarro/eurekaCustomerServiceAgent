import type { RevisionRatingValue } from '../../ports/outbound/message-rating-repository.port';

export type StageRatingsMap = Record<string, RevisionRatingValue>;

export type GetMessageRatingsResult = {
  conversationId: string;
  ratings: {
    raw: StageRatingsMap;
    clean: StageRatingsMap;
    normalize: StageRatingsMap;
    structure: StageRatingsMap;
    chunk: StageRatingsMap;
  };
};
