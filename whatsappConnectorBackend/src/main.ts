import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { Configuration } from 'src/config/configuration';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const BAD_MAC_WARNING = 'Skipped a message due to bad mac';
const KEY_USED_OR_NOT_FILLED_WARNING = 'Skipped message due to key used or not filled';

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBadMacError(error: unknown): boolean {
  return errorToMessage(error).toLowerCase().includes('bad mac');
}

function isKeyUsedOrNotFilledError(error: unknown): boolean {
  const message = errorToMessage(error).toLowerCase();
  return (
    message.includes('messagecountererror') ||
    message.includes('key used already or never filled')
  );
}

function installBadMacNoiseFilter(): void {
  process.on('unhandledRejection', (reason) => {
    if (isBadMacError(reason)) {
      Logger.warn(BAD_MAC_WARNING, 'WhatsappWhiskeySocketsService');
      return;
    }
    if (isKeyUsedOrNotFilledError(reason)) {
      Logger.warn(KEY_USED_OR_NOT_FILLED_WARNING, 'WhatsappWhiskeySocketsService');
      return;
    }

    Logger.error(`Unhandled promise rejection: ${errorToMessage(reason)}`, 'Bootstrap');
  });
}

function installLibsignalConsoleNoiseFilter(): void {
  const originalConsoleError = console.error.bind(console);

  console.error = (...args: unknown[]): void => {
    const joined = args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.name}: ${arg.message}`;
        }

        return String(arg);
      })
      .join(' ')
      .toLowerCase();

    const isLibsignalDecryptNoise =
      joined.includes('failed to decrypt message with any known session') ||
      joined.includes('session error:messagecountererror') ||
      joined.includes('key used already or never filled');

    if (isLibsignalDecryptNoise) {
      Logger.warn(KEY_USED_OR_NOT_FILLED_WARNING, 'WhatsappWhiskeySocketsService');
      return;
    }

    originalConsoleError(...args);
  };
}

function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }

    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function ipv4ToNumber(ip: string): number {
  return ip
    .split('.')
    .map((part) => Number(part))
    .reduce((result, octet) => (result << 8) + octet, 0) >>> 0;
}

function isIpv4WithinCidr(ip: string, cidr: string): boolean {
  const [networkIp, prefixRaw] = cidr.split('/');
  if (!networkIp || !prefixRaw || !isValidIpv4(ip) || !isValidIpv4(networkIp) || !/^\d+$/.test(prefixRaw)) {
    return false;
  }

  const prefix = Number(prefixRaw);
  if (prefix < 0 || prefix > 32) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(networkIp) & mask);
}

function buildCorsOptions(configuration: Configuration): CorsOptions {
  const allowedOrigins = new Set(configuration.corsAllowedOrigins);
  const allowedIps = new Set(configuration.corsAllowedIps);
  const allowedIpRanges = configuration.corsAllowedIpRanges;

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      try {
        const originUrl = new URL(origin);
        const hostname = originUrl.hostname;
        const isAllowedIp =
          isValidIpv4(hostname) &&
          (allowedIps.has(hostname) || allowedIpRanges.some((range) => isIpv4WithinCidr(hostname, range)));

        if (isAllowedIp) {
          callback(null, true);
          return;
        }
      } catch {
        callback(new Error(`Origin "${origin}" is not a valid URL.`), false);
        return;
      }

      callback(new Error(`Origin "${origin}" is not allowed by CORS.`), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']
  };
}

async function bootstrap(): Promise<void> {
  installBadMacNoiseFilter();
  installLibsignalConsoleNoiseFilter();
  const app = await NestFactory.create(AppModule);
  const configuration = app.get(Configuration);
  app.enableCors(buildCorsOptions(configuration));
  await app.listen(configuration.serviceHttpPort, '0.0.0.0');

  Logger.log(
    `whatsappConnectorBackend is listening on TCP port ${configuration.serviceHttpPort}.`,
    'Bootstrap'
  );
}

void bootstrap();
