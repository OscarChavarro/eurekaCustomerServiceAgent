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
      callback_success_behavior:
        'When /auth/google/callback succeeds, the backend stores tokenSet in output/google-auth-session.json and also updates secrets.json at googleAuthSession.tokenSet.',
      next_step:
        'Open authorization_url in a browser, approve access, then Google will call /auth/google/callback. On success, tokenSet is persisted to output/google-auth-session.json and automatically synced to secrets.json (googleAuthSession.tokenSet).'
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
