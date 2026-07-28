import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { Logger, ValidationPipe } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  const configService = app.get(ConfigService);

  // for dev mode : pressing Ctrl + C triggers onModuleDestroy() and your service is deregistered.
  // to test onModuleDestroy method that we use to deregister service instances
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe());
  app.use(cookieParser());
  const port = configService.getOrThrow<number>('SERVICE_PORT');
  await app.listen(port);
  
  Logger.log(
    `Auth Gateway running on port ${port}`,
    'Bootstrap'
  );
}
bootstrap();
