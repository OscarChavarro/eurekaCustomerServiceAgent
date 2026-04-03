import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { ServiceConfig } from './infrastructure/config/service.config';

class ApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  public async start(): Promise<void> {
    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true
      })
    );

    const serviceConfig = app.get(ServiceConfig);
    const canConnectToQdrant = await this.verifyQdrantConnection(serviceConfig);
    if (!canConnectToQdrant) {
      this.logger.error('pausing pod to give change to debug the service');
      await this.delay(serviceConfig.qdrantConnectionFailurePauseMs);
      await app.close();
      process.exit(1);
    }
    this.logger.log('Qdrant connection check succeeded.');

    await app.listen(serviceConfig.port);
  }

  private async verifyQdrantConnection(serviceConfig: ServiceConfig): Promise<boolean> {
    const qdrantHealthUrl = `${serviceConfig.qdrantUrl.replace(/\/$/, '')}/collections`;
    const headers: HeadersInit = {};

    if (serviceConfig.qdrantApiKey) {
      headers['api-key'] = serviceConfig.qdrantApiKey;
    }

    try {
      const response = await fetch(qdrantHealthUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5_000)
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

void new ApplicationBootstrap().start();
