import { envConfig } from '../env/env.config';
import { JwtOptions } from './types/auth.types';

export const jwtConfig: JwtOptions = {
  access: {
    secret: envConfig.JWT_SECRET,
    expiresIn: envConfig.JWT_EXPIRES_IN,
  },
  refresh: {
    secret: envConfig.JWT_REFRESH_SECRET,
    expiresIn: envConfig.JWT_REFRESH_EXPIRES_IN,
  },
};
