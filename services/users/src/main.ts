import { NestFactory } from '@nestjs/core';
import { UserModule } from './user.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(UserModule);
  app.enableCors({
    origin: 'http://localhost:3000', // your Next.js URL
    methods: ['*'],
  });
  const configService = app.get(ConfigService);
  // for dev mode : pressing Ctrl + C triggers onModuleDestroy() and your service is deregistered.
  // to test onModuleDestroy method that we use to deregister service instances
  app.enableShutdownHooks();
  const port = configService.getOrThrow<number>('SERVICE_PORT');
  await app.listen(port);
  Logger.log(`users running on port ${port}`, 'Bootstrap');
}
bootstrap();
