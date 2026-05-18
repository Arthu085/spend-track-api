import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { EnvOptions } from '../env/types/env.types';
import { isDevelopment } from '../env/helpers/env.helpers';

export const getCorsConfig = (env: EnvOptions): CorsOptions => ({
  origin: isDevelopment ? true : env.CLIENT_URL,
  credentials: true,
});
