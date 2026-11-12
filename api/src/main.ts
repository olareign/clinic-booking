import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync } from 'fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './common/http-error.filter';
import { AppConfig, loadConfig } from './config';

/** Shared by main() and the e2e tests so both run the exact same app. */
export function configureApp(app: INestApplication): INestApplication {
  app.use(helmet());
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  return app;
}

export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: ['error', 'warn', 'log'] });
  return configureApp(app);
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env'); // local dev only; hosts inject real env vars
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.port, '0.0.0.0');
}

if (require.main === module) {
  void main();
}
