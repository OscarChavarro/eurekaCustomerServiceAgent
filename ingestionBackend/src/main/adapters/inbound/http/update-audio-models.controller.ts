import { Controller, HttpCode, HttpStatus, Put } from '@nestjs/common';
import type { UpdateAudioModelsResult } from '../../../application/use-cases/update-audio-models/update-audio-models.result';
import { UpdateAudioModelsUseCase } from '../../../application/use-cases/update-audio-models/update-audio-models.use-case';

@Controller()
export class UpdateAudioModelsController {
  constructor(private readonly updateAudioModelsUseCase: UpdateAudioModelsUseCase) {}

  @Put('updateAudioModels')
  @HttpCode(HttpStatus.OK)
  public async updateAudioModels(): Promise<UpdateAudioModelsResult> {
    return this.updateAudioModelsUseCase.execute();
  }
}
