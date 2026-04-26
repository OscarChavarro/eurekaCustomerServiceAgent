import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { ServiceConfig } from './infrastructure/config/service.config';

class ApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  async start(): Promise<void> {
    let app: INestApplication | null = null;

    try {
      this.ensureSecretsFileExists();
      app = await NestFactory.create(AppModule);

      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true
        })
      );

      const serviceConfig = app.get(ServiceConfig);
      const startupValidationOrchestrator = app.get(StartupValidationOrchestrator);
      const startupValidationResult = await startupValidationOrchestrator.validateAll();

      startupValidationResult.successes.forEach((success) => {
        this.logger.log(success.message);
      });

      if (startupValidationResult.failure) {
        this.logger.error(
          `[${startupValidationResult.failure.validatorName}] ${startupValidationResult.failure.message}`
        );
        this.logger.error('Waiting for pod to allow debugging...');
        await this.delay(this.resolveFallbackStartupDelayMs());
        await app.close();
        process.exit(1);
      }

      await app.listen(serviceConfig.port);
      this.logger.log(`preprocessorForIMazingBackend is listening on TCP port ${serviceConfig.port}.`);
    } catch (error) {
      this.logger.error(`Startup failed before service was ready. ${this.toErrorMessage(error)}`);
      this.logger.error('Waiting for pod to allow debugging...');
      await this.delay(this.resolveFallbackStartupDelayMs());

      if (app) {
        await app.close();
      }

      process.exit(1);
    }
  }

  private ensureSecretsFileExists(): void {
    const secretsPath = join(process.cwd(), 'secrets.json');
    if (!existsSync(secretsPath)) {
      throw new Error(`secrets.json not found at ${secretsPath}. Create it from secrets-example.json.`);
    }
  }

  private resolveFallbackStartupDelayMs(): number {
    const raw = process.env.STARTUP_FAILURE_PAUSE_MINUTES;
    if (!raw) {
      return 15 * 60_000;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 15 * 60_000;
    }

    return parsed * 60_000;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}

void new ApplicationBootstrap().start();
