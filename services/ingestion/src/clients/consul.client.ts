import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { normalizeError } from '../common/utils/axios-error.util';

interface ConsulHealthCheck {
  AggregatedStatus: string;
  Service: {
    Address: string;
    Port: number;
  };
}

@Injectable()
export class ConsulClient implements OnModuleInit, OnModuleDestroy {
  private serviceId!: string;
  private consulUrl!: string;
  private serviceHost!: string;
  private servicePort!: number;
  private serviceName!: string;

  // keep the constructor for dependency injection only,
  // and use onModuleInit for initialization logic because it ensures all dependencies in the module are ready.
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {}

  // Register the service in Consul when the module initializes
  async onModuleInit() {
    this.consulUrl = this.configService.getOrThrow<string>('ConsulBaseUrl');
    this.serviceId =
      this.configService.get<string>('SERVICE_NAME') + '-' + Date.now();
    this.serviceHost = this.configService.getOrThrow('SERVICE_HOST');
    this.servicePort = Number.parseInt(
      this.configService.getOrThrow<string>('SERVICE_PORT'),
    );
    this.serviceName = this.configService.getOrThrow<string>('SERVICE_NAME');

    const registerUrl = this.getRegisterUrl();
    const instanceData = this.buildServiceRegistrationPayload();
    try {
      await firstValueFrom(this.httpService.put(registerUrl, instanceData));
      this.logger.log(this.serviceName + ' is registered with Consul');
    } catch (error) {
      this.logger.error(
        `${this.serviceName} - ${JSON.stringify(normalizeError(error as AxiosError))}`,
      );
    }
  }

  // Deregister the service in Consul when the module is destroyed
  async onModuleDestroy() {
    const deregisterUrl = this.getDeRegisterUrl();
    const instanceData = this.buildServiceRegistrationPayload();
    try {
      await firstValueFrom(this.httpService.put(deregisterUrl, instanceData));
      this.logger.log(this.serviceId + ' is deregistered with Consul');
    } catch (error) {
      this.logger.error(
        this.serviceName + JSON.stringify(normalizeError(error as AxiosError)),
      );
    }
  }

  private getRegisterUrl() {
    return `${this.consulUrl}/v1/agent/service/register?replace-existing-checks=true`;
  }

  private buildServiceRegistrationPayload() {
    return {
      ID: this.serviceId,
      Name: this.serviceName,
      Tags: ['v1'],
      Address: this.serviceHost,
      Port: this.servicePort,
      Check: this.buildHealthCheck(),
    };
  }

  private buildHealthCheck() {
    const host = this.serviceHost;
    const port = this.servicePort;
    const name = this.serviceName;
    return {
      Name: name + 'service check',
      HTTP: `http://${host}:${port}/ingestion/check`,
      Interval: '10s',
      Timeout: '5s',
      DeregisterCriticalServiceAfter: '90m',
    };
  }

  private getDeRegisterUrl() {
    return `${this.consulUrl}/v1/agent/service/deregister/` + this.serviceId;
  }

  // Avoid circular dependency

  // Discover other services using Consul
  async discoverService(serviceName: string): Promise<string> {
    const instances = await this.fetchInstances(serviceName);
    return this.resolveHealthyBaseUrl(instances);
  }

  private async fetchInstances(
    serviceName: string,
  ): Promise<ConsulHealthCheck[]> {
    const { data } = await firstValueFrom(
      this.httpService.get<ConsulHealthCheck[]>(
        this.getDiscoverUrl(serviceName),
      ),
    );
    return data;
  }

  private getDiscoverUrl(serviceName: string): string {
    return `${this.consulUrl}/v1/agent/health/service/name/${serviceName}`;
  }

  private resolveHealthyBaseUrl(instances: ConsulHealthCheck[]): string {
    let healthy: ConsulHealthCheck | undefined;
    try {
      healthy = instances.find((i) => i.AggregatedStatus === 'passing');
    } catch (error) {
      const err = error as Error;
      this.logger.error(err);
      throw new NotFoundException(err.message);
    }
    if (!healthy) throw new NotFoundException(`No healthy instance found`);
    return `http://${healthy.Service.Address}:${healthy.Service.Port}`;
  }
}
