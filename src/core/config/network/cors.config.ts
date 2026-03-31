import { envConfig } from '../env/env.config';
import { isDevelopment } from '../env/env.helpers';

export const corsConfig = {
  origin: isDevelopment ? true : envConfig.CLIENT_URL,
  credentials: true,
};
