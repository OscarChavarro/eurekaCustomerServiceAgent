import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CompleteGoogleAuthCallbackUseCase } from '../../../application/use-cases/01-auth/complete-google-auth-callback.use-case';
import { StartGoogleAuthUseCase } from '../../../application/use-cases/01-auth/start-google-auth.use-case';

@Controller('auth/google')
export class AuthGoogleController {
  constructor(
    private readonly startGoogleAuthUseCase: StartGoogleAuthUseCase,
    private readonly completeGoogleAuthCallbackUseCase: CompleteGoogleAuthCallbackUseCase
  ) {}

  @Get('start')
  public async startAuth(): Promise<unknown> {
    const result = await this.startGoogleAuthUseCase.execute();

    return {
      authorization_url: result.authorizationUrl,
      state: result.state,
      next_step:
        'Open authorization_url in a browser, approve access, then Google will call /auth/google/callback. The token set will be stored at output/google-auth-session.json; copy tokenSet into secrets.json (googleAuthSession.tokenSet) for persistent local use.'
    };
  }

  @Get('callback')
  public async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined
  ): Promise<unknown> {
    if (!code || code.trim().length === 0) {
      throw new BadRequestException('Query parameter "code" is required.');
    }

    if (!state || state.trim().length === 0) {
      throw new BadRequestException('Query parameter "state" is required.');
    }

    return this.completeGoogleAuthCallbackUseCase.execute({
      code: code.trim(),
      state: state.trim()
    });
  }
}
