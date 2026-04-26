import { Body, Controller, Post } from '@nestjs/common';
import { resolve } from 'node:path';
import { PreprocessWhatsappExportUseCase } from '../../../application/PreprocessWhatsappExportUseCase';
import { NormalizePathRequest } from './dto/normalize-path.request';

@Controller()
export class NormalizePathController {
  constructor(private readonly preprocessWhatsappExportUseCase: PreprocessWhatsappExportUseCase) {}

  @Post('normalizePath')
  async normalizePath(@Body() request: NormalizePathRequest): Promise<{ status: 'ok' }> {
    await this.preprocessWhatsappExportUseCase.execute(resolve(request.path));

    return { status: 'ok' };
  }
}
