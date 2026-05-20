import { ConfigService } from '@nestjs/config';
import { EnvOptions } from '../types/env.types';

export type AppConfig = {
  env: EnvOptions;
};

export type AppConfigService = ConfigService<AppConfig, true>;

export function getEnvOptions(configService: AppConfigService): EnvOptions {
  return configService.get('env', { infer: true });
}

export const isProduction = process.env.NODE_ENV === 'production';

export const isDevelopment = process.env.NODE_ENV === 'development';

export const isTest = process.env.NODE_ENV === 'test';

export const isLoggingEnabled = process.env.NODE_ENV !== 'test';

export const isLocalhost = (process.env.CLIENT_URL || '').includes('localhost');
