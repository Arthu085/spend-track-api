import { envConfig } from './env.config';

export const isProduction = envConfig.NODE_ENV === 'production';

export const isDevelopment = envConfig.NODE_ENV === 'development';

export const isTest = envConfig.NODE_ENV === 'test';

export const isLoggingEnabled = envConfig.NODE_ENV !== 'test';

export const isLocalhost = envConfig.CLIENT_URL.includes('localhost');
