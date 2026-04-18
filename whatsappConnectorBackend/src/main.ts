import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { Configuration } from 'src/config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const configuration = app.get(Configuration);

  Logger.log(
    `${configuration.serviceStartupLogPrefix}: bootstrapped and waiting for WhatsApp messages.`,
    'Bootstrap'
  );
}

void bootstrap();
