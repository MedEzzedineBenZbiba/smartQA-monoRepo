import { NestFactory } from '@nestjs/core';
import { IssuesModule } from './issues.module';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { ConfigService } from '@nestjs/config';
import { normalizeError } from './common/util/normalizedError.util';

async function bootstrap() {
  const logger = new Logger('KafkaBootstrap');

  const app = await NestFactory.create(IssuesModule);
  app.enableCors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  const configService = app.get(ConfigService);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [configService.getOrThrow('KAFKA_BROKERS')],
        retry: {
          initialRetryTime: 1000,
          retries: 8,
          maxRetryTime: 5000,
          factor: 2,
        },
      },
      consumer: {
        groupId: configService.getOrThrow('KAFKA_CONSUMER_GROUP_ID'),
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: true,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 5000,
      },
      run: {
        autoCommit: false,
      },
    },
  });

  try {
    app.enableShutdownHooks();
    const port = configService.getOrThrow<number>('SERVICE_PORT');
    await app.startAllMicroservices();
    await app.listen(port);

    logger.log(`issues service running on port ${port}`, 'Bootstrap');
    logger.log('issues Service successfully connected to Kafka');
  } catch (error) {
    logger.error(normalizeError(error));
    process.exit(1);
  }
}

void bootstrap(); // <-- fixed floating promise
