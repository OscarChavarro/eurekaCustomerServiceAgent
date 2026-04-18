import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { Configuration } from 'src/config/configuration';

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

async function bootstrap(): Promise<void> {
  installBadMacNoiseFilter();
  installLibsignalConsoleNoiseFilter();
  const app = await NestFactory.create(AppModule);
  const configuration = app.get(Configuration);
  await app.listen(configuration.serviceHttpPort, '0.0.0.0');

  Logger.log(
    `${configuration.serviceStartupLogPrefix}: bootstrapped. HTTP listening on ${configuration.serviceHttpPort} and waiting for WhatsApp messages.`,
    'Bootstrap'
  );
}

void bootstrap();
