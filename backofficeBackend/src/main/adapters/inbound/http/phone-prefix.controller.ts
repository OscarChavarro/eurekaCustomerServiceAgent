import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { GetPhonePrefixResult } from '../../../application/use-cases/get-phone-prefix/get-phone-prefix.result';
import { GetPhonePrefixUseCase } from '../../../application/use-cases/get-phone-prefix/get-phone-prefix.use-case';

@Controller('phone-prefix')
export class PhonePrefixController {
  constructor(private readonly getPhonePrefixUseCase: GetPhonePrefixUseCase) {}

  @Get()
  public getPhonePrefix(@Query('phone') phone: string | undefined): GetPhonePrefixResult {
    if (!phone || phone.trim().length === 0) {
      throw new BadRequestException('Query parameter "phone" is required.');
    }

    return this.getPhonePrefixUseCase.execute(phone);
  }
}
