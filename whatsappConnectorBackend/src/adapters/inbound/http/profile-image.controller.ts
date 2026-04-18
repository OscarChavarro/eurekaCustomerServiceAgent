import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GetProfileImageUseCase } from 'src/application/usecases/get-profile-image.usecase';

@Controller()
export class ProfileImageController {
  constructor(private readonly getProfileImageUseCase: GetProfileImageUseCase) {}

  @Get('profileImage')
  public async getProfileImage(
    @Query('phoneNumber') phoneNumber: string | undefined,
    @Res() response: Response
  ): Promise<void> {
    const image = await this.getProfileImageUseCase.execute(phoneNumber);
    response.setHeader('Content-Type', image.mimeType);
    response.status(200).send(image.bytes);
  }
}
