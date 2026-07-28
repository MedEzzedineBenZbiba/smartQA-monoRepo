import { NestFactory } from '@nestjs/core';
import { IngestionModule } from './ingestion.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(IngestionModule);
  const configService = app.get(ConfigService);
  // for dev mode : pressing Ctrl + C triggers onModuleDestroy() and your service is deregistered.
  // to test onModuleDestroy method that we use to deregister service instances
  app.enableShutdownHooks();
  const port = configService.getOrThrow<number>('SERVICE_PORT');
  await app.listen(port);

  Logger.log(`Ingestion service running on port ${port}`, 'Bootstrap');
}
bootstrap();
