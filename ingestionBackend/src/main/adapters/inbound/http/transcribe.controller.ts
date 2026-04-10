import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AudioTranscribeCommand } from '../../../application/use-cases/audio-transcribe/audio-transcribe.command';
import type { AudioTranscribeResult } from '../../../application/use-cases/audio-transcribe/audio-transcribe.result';
import { AudioTranscribeUseCase } from '../../../application/use-cases/audio-transcribe/audio-transcribe.use-case';
import { TranscribeRequest } from './dto/transcribe.request';

@Controller()
export class TranscribeController {
  constructor(private readonly audioTranscribeUseCase: AudioTranscribeUseCase) {}

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  public async transcribe(
    @Body() request: TranscribeRequest
  ): Promise<AudioTranscribeResult> {
    return this.audioTranscribeUseCase.execute(
      new AudioTranscribeCommand(request.url)
    );
  }
}

