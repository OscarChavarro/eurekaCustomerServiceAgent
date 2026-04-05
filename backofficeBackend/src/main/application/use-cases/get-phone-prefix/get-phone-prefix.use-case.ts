import { Inject, Injectable } from '@nestjs/common';
import type { GetPhonePrefixUseCasePort } from '../../ports/inbound/get-phone-prefix.use-case.port';
import type { PhonePrefixCatalogPort } from '../../ports/outbound/phone-prefix-catalog.port';
import { TOKENS } from '../../ports/tokens';
import type { GetPhonePrefixResult } from './get-phone-prefix.result';

@Injectable()
export class GetPhonePrefixUseCase implements GetPhonePrefixUseCasePort {
  constructor(
    @Inject(TOKENS.PhonePrefixCatalogPort)
    private readonly phonePrefixCatalogPort: PhonePrefixCatalogPort
  ) {}

  public execute(phone: string): GetPhonePrefixResult {
    const resolved = this.phonePrefixCatalogPort.lookupByPhone(phone);

    return {
      input: phone,
      ...resolved
    };
  }
}
