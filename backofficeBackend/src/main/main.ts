import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { ServiceConfig } from './infrastructure/config/service.config';

class ApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  public async start(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    const serviceConfig = app.get(ServiceConfig);
    app.enableCors({
      origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
        if (this.isAllowedOrigin(origin, serviceConfig)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin not allowed by CORS: ${origin ?? 'unknown'}`), false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    });

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true
      })
    );

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
      await this.delay(serviceConfig.mongoConnectionFailurePauseMs);
      await app.close();
      process.exit(1);
    }

    await app.listen(serviceConfig.port);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private isAllowedOrigin(origin: string | undefined, serviceConfig: ServiceConfig): boolean {
    if (!origin) {
      return true;
    }

    if (serviceConfig.corsConfig.allowedOrigins.includes(origin)) {
      return true;
    }

    const allowedNetworkCidr = serviceConfig.corsConfig.allowedNetworkCidr;
    if (!allowedNetworkCidr) {
      return false;
    }

    const host = this.extractHost(origin);
    if (!host) {
      return false;
    }

    return this.isIpInCidr(host, allowedNetworkCidr);
  }

  private extractHost(origin: string): string | null {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch {
      return null;
    }
  }

  private isIpInCidr(host: string, cidr: string): boolean {
    const [networkIp, prefixLengthRaw] = cidr.split('/');
    const prefixLength = Number.parseInt(prefixLengthRaw ?? '', 10);

    if (!networkIp || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
      return false;
    }

    const hostInt = this.ipv4ToInt(host);
    const networkInt = this.ipv4ToInt(networkIp);

    if (hostInt === null || networkInt === null) {
      return false;
    }

    if (prefixLength === 0) {
      return true;
    }

    const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
    return (hostInt & mask) === (networkInt & mask);
  }

  private ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) {
      return null;
    }

    const octets = parts.map((part) => Number.parseInt(part, 10));
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }

    const [o0, o1, o2, o3] = octets;
    if (o0 === undefined || o1 === undefined || o2 === undefined || o3 === undefined) {
      return null;
    }

    return (((o0 << 24) >>> 0) + ((o1 << 16) >>> 0) + ((o2 << 8) >>> 0) + (o3 >>> 0)) >>> 0;
  }
}

void new ApplicationBootstrap().start();
