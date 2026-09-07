import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { AxiosError } from 'axios';
import { normalizeError } from 'src/common/utils/axios-error.util';
import { KAFKA_TOPICS } from 'src/constants/kafka.constants';

interface GithubIssue {
  userId?: string;
  [key: string]: unknown;
}

@Injectable()
export class KafkaProducerClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject('KAFKA_PRODUCER_SERVICE')
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    // Connect the client when the module initializes
    try {
      await this.kafkaClient.connect();
      this.logger.log('Kafka Producer Client connected successfully');
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
    }
  }

  async onModuleDestroy() {
    // Disconnect the client when the application shuts down
    await this.kafkaClient.close();
    this.logger.log('Kafka Producer Client disconnected');
  }

  publishIssues(issues: GithubIssue[], userId: string | undefined) {
    const topic = KAFKA_TOPICS.PUBLISH_ISSUES;
    issues.forEach((issue) => {
      issue.userId = userId;
      const eventPayload = {
        issueId: `ISSUE-${Date.now()}`, // Simple unique ID
        issue,
        timestamp: new Date().toISOString(),
      };

      try {
        this.kafkaClient.emit(topic, JSON.stringify(eventPayload));
        // return { success: true, publishedEvent: eventPayload };
      } catch (error) {
        this.logger.error(normalizeError(error as AxiosError));
        throw new InternalServerErrorException((error as Error).message);
      }
    });
  }
}
