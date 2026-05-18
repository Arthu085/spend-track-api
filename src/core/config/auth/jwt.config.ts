import { EnvOptions } from '../env/types/env.types';
import { JwtOptions } from './types/auth.types';

export const getJwtConfig = (env: EnvOptions): JwtOptions => ({
  access: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  refresh: {
    secret: env.JWT_REFRESH_SECRET,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
});
