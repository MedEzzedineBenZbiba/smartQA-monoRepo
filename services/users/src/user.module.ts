import { Logger, Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { ConsulClient } from './clients/consul.client';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';

import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { SyncJob } from './entities/sync-job.entity';
import { GithubToken } from './entities/github-token.entity';
import { GithubTokenService } from './github-token.service';
import { SyncJobService } from './sync-job.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async () => {
        const configService = new ConfigService();
        return {
          type: 'postgres',
          host: configService.get('POSTGRES_HOST'),
          port: configService.get('POSTGRES_PORT'),
          username: configService.get('POSTGRES_USER'),
          password: configService.get('POSTGRES_PASSWORD'),
          database: configService.get('POSTGRES_DATABASE'),
          entities: [User, GithubToken, SyncJob],
          synchronize: true,
        };
      },
    }),
    TypeOrmModule.forFeature([User, GithubToken, SyncJob]),

    // TypeOrmModule.forRoot({
    //   type: 'sqlite',
    //   database: 'db.sqlite',
    //   entities: [User],
    //   synchronize: true,
    // }),
    // TypeOrmModule.forFeature([User]),

    JwtModule.register({}),
  ],

  controllers: [UserController],
  providers: [
    UserService,
    Logger,
    ConsulClient,
    GithubTokenService,
    SyncJobService,
  ],
  exports: [UserService],
})
export class UserModule {}
