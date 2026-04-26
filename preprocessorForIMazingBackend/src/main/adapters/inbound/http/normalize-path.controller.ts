import { BadRequestException, Body, Controller, InternalServerErrorException, Post } from '@nestjs/common';
import { resolve } from 'node:path';
import { MergeMediaInputValidationError, MergeMediaResult, MergeMediaUseCase } from '../../../application/MergeMediaUseCase';
import { PreprocessWhatsappExportUseCase } from '../../../application/PreprocessWhatsappExportUseCase';
import { MergeMediaRequest } from './dto/merge-media.request';
import { NormalizePathRequest } from './dto/normalize-path.request';

@Controller()
export class NormalizePathController {
  constructor(
    private readonly preprocessWhatsappExportUseCase: PreprocessWhatsappExportUseCase,
    private readonly mergeMediaUseCase: MergeMediaUseCase
  ) {}

  @Post('normalizePath')
  async normalizePath(@Body() request: NormalizePathRequest): Promise<{ status: 'ok' }> {
    await this.preprocessWhatsappExportUseCase.execute(resolve(request.path));

    return { status: 'ok' };
  }

  @Post('mergeMedia')
  async mergeMedia(@Body() request: MergeMediaRequest): Promise<MergeMediaResult> {
    try {
      return await this.mergeMediaUseCase.execute(request.sourceDiffPath, request.targetMergedPath);
    } catch (error) {
      if (error instanceof MergeMediaInputValidationError) {
        throw new BadRequestException(
          this.mergeMediaUseCase.buildMissingDirectoryResult(
            request.sourceDiffPath,
            request.targetMergedPath,
            error.missingDirectoryPath
          )
        );
      }

      throw new InternalServerErrorException(
        this.mergeMediaUseCase.buildUnexpectedErrorResult(request.sourceDiffPath, request.targetMergedPath, error)
      );
    }
  }
}
