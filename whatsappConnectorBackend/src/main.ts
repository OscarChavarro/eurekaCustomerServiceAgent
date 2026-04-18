import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { Configuration } from 'src/config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configuration = app.get(Configuration);
  await app.listen(configuration.serviceHttpPort, '0.0.0.0');

  Logger.log(
    `${configuration.serviceStartupLogPrefix}: bootstrapped. HTTP listening on ${configuration.serviceHttpPort} and waiting for WhatsApp messages.`,
    'Bootstrap'
  );
}

void bootstrap();
