import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { normalizeAxiosError } from '../common/utils/axios-error.util';
import { KAFKA_TOPICS } from '../constants/kafka.constants';

interface ResetNotification {
  email: string;
  resetPasswordToken: string;
}

@Injectable()
export class KafkaProducerClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject('KAFKA_PRODUCER_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Connect the client when the module initialized
    try {
      await this.kafkaClient.connect();
      this.logger.log(
        'Kafka Producer Client connected successfully',
        KafkaProducerClient.name,
      );
    } catch (error) {
      this.logger.error(
        'Failed to connect Kafka Producer Client',
        error,
        KafkaProducerClient.name,
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.kafkaClient.close();
      this.logger.log(
        'Kafka Producer Client disconnected',
        KafkaProducerClient.name,
      );
    } catch (error) {
      this.logger.error(
        'Failed to disconnect Kafka Producer Client',
        error,
        KafkaProducerClient.name,
      );
    }
  }

  async publishNotification(notification: ResetNotification) {
    const resetLink = this.buildResetLink(notification.resetPasswordToken);
    const payload = {
      email: notification.email,
      resetLink,
    };

    const eventPayload = this.buildEventPayload(payload);
    const topic = KAFKA_TOPICS.PUBLISH_MAIL;
    try {
      await firstValueFrom(
        this.kafkaClient.emit(topic, JSON.stringify(eventPayload)),
      );
      this.logger.log(
        `Published event to topic [${topic}]`,
        KafkaProducerClient.name,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish event to topic [${topic}]`,
        JSON.stringify(normalizeAxiosError(error)),
        KafkaProducerClient.name,
      );
    }
  }

  private buildEventPayload(notification: {
    email: string;
    resetLink: string;
  }) {
    return {
      notificationId: `notification-${Date.now()}`,
      notification,
      timestamp: new Date().toISOString(),
    };
  }

  private buildResetLink(resetPasswordToken: string): string {
    return (
      'http://' +
      'localhost' +
      '/auth/reset-password?resetToken=' +
      resetPasswordToken
    );
  }
}
