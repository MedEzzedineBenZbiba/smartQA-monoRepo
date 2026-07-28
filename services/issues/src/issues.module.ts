import { Logger, Module } from '@nestjs/common';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Issue, IssueSchema } from './issue.schema';
import { ConsulClient } from './clients/consul.client';
import { HttpModule } from '@nestjs/axios';
import { config } from 'process';
import { JwtModule } from '@nestjs/jwt';
import { VectorIndexInitializer } from './vector-index.initializer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({}),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MongoDBConfig'),
      }),
    }),
    MongooseModule.forFeature([{ name: Issue.name, schema: IssueSchema }]),
    HttpModule,
  ],
  controllers: [IssuesController],
  providers: [IssuesService, Logger, ConsulClient, VectorIndexInitializer],
})
export class IssuesModule {}
