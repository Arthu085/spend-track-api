import { envConfig } from '../env/env.config';
import { JwtConfig } from './auth.types';

export const jwtConfig: JwtConfig = {
  access: { secret: envConfig.JWT_SECRET, expiresIn: envConfig.JWT_EXPIRES_IN },
  refresh: {
    secret: envConfig.JWT_REFRESH_SECRET,
    expiresIn: envConfig.JWT_REFRESH_EXPIRES_IN,
  },
};
