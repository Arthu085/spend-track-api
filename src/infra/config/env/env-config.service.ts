import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnvConfigService {
  constructor(private configService: ConfigService) {}

  get nodeEnv(): string {
    return this.configService.getOrThrow<string>('NODE_ENV');
  }

  get port(): number {
    return this.configService.getOrThrow<number>('PORT');
  }

  get clientUrl(): string {
    return this.configService.getOrThrow<string>('CLIENT_URL');
  }

  get databaseConfig() {
    return {
      host: this.configService.getOrThrow<string>('DB_HOST'),
      port: this.configService.getOrThrow<number>('DB_PORT'),
      username: this.configService.getOrThrow<string>('DB_USERNAME'),
      password: this.configService.getOrThrow<string>('DB_PASSWORD'),
      database: this.configService.getOrThrow<string>('DB_NAME'),
      schema: this.configService.getOrThrow<string>('DB_SCHEMA'),
      ssl: this.configService.getOrThrow<boolean>('DB_SSL'),
    };
  }

  get jwtConfig() {
    return {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('JWT_SECRET_EXPIRES_IN'),
    };
  }

  get refreshTokenConfig() {
    return {
      secret: this.configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
      expiresIn: this.configService.getOrThrow<string>(
        'REFRESH_TOKEN_SECRET_EXPIRES_IN',
      ),
    };
  }
}
