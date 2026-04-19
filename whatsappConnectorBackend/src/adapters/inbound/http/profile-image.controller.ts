import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GetProfileImageUseCase, ProfileImageSize } from 'src/application/usecases/get-profile-image.usecase';

@Controller()
export class ProfileImageController {
  constructor(private readonly getProfileImageUseCase: GetProfileImageUseCase) {}

  @Get('profileImage')
  public async getProfileImage(
    @Query('phoneNumber') phoneNumber: string | undefined,
    @Query('size') sizeRaw: string | undefined,
    @Query('cached-only') cachedOnlyRaw: string | undefined,
    @Res() response: Response
  ): Promise<void> {
    const size: ProfileImageSize = sizeRaw?.toLowerCase() === 'small' ? 'small' : 'original';
    const cachedOnly = cachedOnlyRaw?.toLowerCase() === 'true';
    const result = await this.getProfileImageUseCase.execute(phoneNumber, size, cachedOnly);

    if (result.status === 'connection_error') {
      response.sendStatus(404);
      return;
    }
    if (result.status === 'invalid_phone') {
      response.sendStatus(400);
      return;
    }
    if (result.status === 'not_found') {
      if (cachedOnly) {
        response.sendStatus(404);
        return;
      }
      response.sendStatus(204);
      return;
    }

    response.setHeader('Content-Type', result.image.mimeType);
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.status(200).send(result.image.bytes);
  }
}
