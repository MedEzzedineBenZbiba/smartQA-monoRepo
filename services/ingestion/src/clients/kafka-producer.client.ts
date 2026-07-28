// order-service/src/order/order.service.ts
import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { normalizeError } from 'src/common/utils/axios-error.util';
import { KAFKA_TOPICS } from 'src/constants/kafka.constants';

@Injectable()
export class KafkaProducerClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject('KAFKA_PRODUCER_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    // Connect the client when the module initializes
    try {
      await this.kafkaClient.connect();
      this.logger.log('Kafka Producer Client connected successfully');
    } catch (error) {
      this.logger.error(normalizeError(error));
    }
  }

  async onModuleDestroy() {
    // Disconnect the client when the application shuts down
    await this.kafkaClient.close();
    this.logger.log('Kafka Producer Client disconnected');
  }

  async publishIssues(issues: [], userId: string | undefined) {
    const topic = KAFKA_TOPICS.PUBLISH_ISSUES;
    issues.forEach((issue: any) => {
      issue.userId = userId;
      const eventPayload = {
        issueId: `ISSUE-${Date.now()}`, // Simple unique ID
        issue,
        timestamp: new Date().toISOString(),
      };

      try {
        this.kafkaClient.emit(topic, JSON.stringify(eventPayload));
        // return { success: true, publishedEvent: eventPayload };
      } catch (error: any) {
        this.logger.error(normalizeError(error));
        throw new InternalServerErrorException(error.message);
      }
    });
  }
}
