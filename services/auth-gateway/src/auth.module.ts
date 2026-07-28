import { Logger, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConsulClient } from './clients/consul.client';
import { HttpModule } from '@nestjs/axios';
import { KafkaProducerClient } from './clients/kafka-producer.client';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { JWT_RESET_PASSWORD_EXPIRY } from './constants/auth.constants';
import { UserServiceClient } from './clients/user-service.client';
import { KeyclockClient } from './clients/keyclock.client';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // ← add this FIRST,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_RESET_PASSWORD_SECRET'),
        signOptions: { expiresIn: JWT_RESET_PASSWORD_EXPIRY },
        global: true,
      }),
    }),

    ClientsModule.registerAsync([
      {
        name: 'KAFKA_PRODUCER_SERVICE', // Injection token for the Kafka client
        inject: [ConfigService], 
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: configService.getOrThrow('KAFKA_CLIENT_ID'),
              brokers: [configService.getOrThrow('KAFKA_BROKER')] 
            },
            producer: {
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
    HttpModule
  ],
  controllers: [AuthController],
  providers: [AuthService, ConsulClient, KafkaProducerClient,UserServiceClient, Logger, KeyclockClient],
  exports: []

})
export class AuthModule {}
