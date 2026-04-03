import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
  Post
} from '@nestjs/common';
import { QdrantConnectionError } from '../../../application/errors/qdrant-connection.error';
import { KwoledgeIngestionCommand } from '../../../application/use-cases/kwoledge-ingestion/kwoledge-ingestion.command';
import type { KwoledgeIngestionResult } from '../../../application/use-cases/kwoledge-ingestion/kwoledge-ingestion.result';
import { KwoledgeIngestionUseCase } from '../../../application/use-cases/kwoledge-ingestion/kwoledge-ingestion.use-case';
import { ProcessFolderRequest } from './dto/process-folder.request';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly kwoledgeIngestionUseCase: KwoledgeIngestionUseCase) {}

  @Post('process-folder')
  @HttpCode(HttpStatus.OK)
  public async processFolder(
    @Body() request: ProcessFolderRequest
  ): Promise<KwoledgeIngestionResult> {
    try {
      return await this.kwoledgeIngestionUseCase.execute(
        new KwoledgeIngestionCommand(request.folderPath)
      );
    } catch (error) {
      if (error instanceof QdrantConnectionError) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          message: error.message,
          extra:
            'can not connect to Qdrant, pending to review credentials in secrets.json'
        });
      }

      throw error;
    }
  }
}
