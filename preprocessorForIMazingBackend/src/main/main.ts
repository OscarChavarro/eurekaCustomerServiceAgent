import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { ServiceConfig } from './infrastructure/config/service.config';

class ApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  async start(): Promise<void> {
    const app = await NestFactory.create(AppModule);

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
      await app.close();
      process.exit(1);
    }

    await app.listen(serviceConfig.port);
    this.logger.log(`preprocessorForIMazingBackend is listening on TCP port ${serviceConfig.port}.`);
  }
}

void new ApplicationBootstrap().start();
