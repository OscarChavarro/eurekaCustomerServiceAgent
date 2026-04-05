import type { GetPhonePrefixResult } from '../../use-cases/get-phone-prefix/get-phone-prefix.result';

export interface GetPhonePrefixUseCasePort {
  execute(phone: string): GetPhonePrefixResult;
}
