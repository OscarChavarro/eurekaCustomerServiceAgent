import type {
  RateMessageCommand,
  RateMessageResult
} from '../../use-cases/rate-message/rate-message.types';

export interface RateMessageUseCasePort {
  execute(command: RateMessageCommand): Promise<RateMessageResult>;
}
