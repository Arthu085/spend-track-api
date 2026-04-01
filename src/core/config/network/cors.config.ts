import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { envConfig } from '../env/env.config';
import { isDevelopment } from '../env/helpers/env.helpers';

export const corsConfig: CorsOptions = {
  origin: isDevelopment ? true : envConfig.CLIENT_URL,
  credentials: true,
};
