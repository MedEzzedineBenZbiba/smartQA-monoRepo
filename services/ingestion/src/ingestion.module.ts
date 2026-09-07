import { Logger, Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { KafkaProducerClient } from './clients/kafka-producer.client';
import { ConsulClient } from './clients/consul.client';
import { Partitioners } from 'kafkajs';
import { JwtModule } from '@nestjs/jwt';
import { UserServiceClient } from './clients/user-service.client';
import { SyncJobScheduler } from './sync-job.scheduler';

@Module({
  imports: [
    HttpModule,
    JwtModule.register({}),
    ConfigModule.forRoot({ isGlobal: true }), // make ConfigService available
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_PRODUCER_SERVICE', // Injection token for the Kafka client
        inject: [ConfigService], // Inject ConfigService into the factory
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: configService.getOrThrow<string>('KAFKA_CLIENT_ID'), // Unique client ID
              brokers: [configService.getOrThrow<string>('KAFKA_BROKERS')],
            },
            producer: {
              createPartitioner: Partitioners.LegacyPartitioner,
              allowAutoTopicCreation: true, // Convenient for development
              idempotent: true, // Prevents the same message from being saved multiple times
              retry: {
                retries: 5,
                maxRetryTime: 30000,
              },
            },
          },
        }),
      },
    ]),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    Logger,
    KafkaProducerClient,
    ConsulClient,
    UserServiceClient,
    SyncJobScheduler,
  ], // Provide Logger
})
export class IngestionModule {}
