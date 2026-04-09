import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isIP } from 'node:net';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { ServiceConfig, type CorsConfig } from './infrastructure/config/service.config';

class ApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  public async start(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    const serviceConfig = app.get(ServiceConfig);
    const isCorsOriginAllowed = createCorsAccessEvaluator(serviceConfig.corsConfig);

    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void
      ) => {
        if (isCorsOriginAllowed(origin ?? undefined)) {
          callback(null, true);
          return;
        }

        callback(null, false);
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
      await app.close();
      process.exit(1);
    }

    await app.listen(serviceConfig.port);
    this.logger.log(`contactsBackend listening on port ${serviceConfig.port}`);
  }
}

void new ApplicationBootstrap().start();

type ParsedIpv4Cidr = {
  network: number;
  mask: number;
};

function createCorsAccessEvaluator(corsConfig: CorsConfig): (origin: string | undefined) => boolean {
  const allowedOrigins = new Set(corsConfig.allowedOrigins.map((origin) => origin.toLowerCase()));
  const parsedAllowedNetwork = parseIpv4Cidr(corsConfig.allowedNetworkCidr);

  return (origin: string | undefined): boolean => {
    if (!origin) {
      return true;
    }

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      return false;
    }

    const normalizedOrigin = parsedOrigin.origin.toLowerCase();
    if (allowedOrigins.has(normalizedOrigin)) {
      return true;
    }

    if (!parsedAllowedNetwork) {
      return false;
    }

    return isIpv4InCidrRange(parsedOrigin.hostname, parsedAllowedNetwork);
  };
}

function parseIpv4Cidr(cidr: string | null): ParsedIpv4Cidr | null {
  if (!cidr) {
    return null;
  }

  const [baseAddress, prefixRaw] = cidr.split('/');
  if (!baseAddress || !prefixRaw) {
    throw new Error(`Invalid allowedNetworkCidr "${cidr}". Expected format "x.x.x.x/24".`);
  }

  const prefix = Number.parseInt(prefixRaw, 10);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid CIDR prefix in "${cidr}". Prefix must be an integer between 0 and 32.`);
  }

  const networkAddress = ipv4ToInt(baseAddress);
  if (networkAddress === null) {
    throw new Error(`Invalid IPv4 network address in allowedNetworkCidr "${cidr}".`);
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

  return {
    network: networkAddress & mask,
    mask
  };
}

function isIpv4InCidrRange(hostname: string, cidr: ParsedIpv4Cidr): boolean {
  const hostAsInt = ipv4ToInt(hostname);
  if (hostAsInt === null) {
    return false;
  }

  return (hostAsInt & cidr.mask) === cidr.network;
}

function ipv4ToInt(ipAddress: string): number | null {
  if (isIP(ipAddress) !== 4) {
    return null;
  }

  const octets = ipAddress.split('.').map((octet) => Number.parseInt(octet, 10));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return (
    ((octets[0] ?? 0) << 24) >>> 0 |
    ((octets[1] ?? 0) << 16) |
    ((octets[2] ?? 0) << 8) |
    (octets[3] ?? 0)
  ) >>> 0;
}
