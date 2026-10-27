import * as Joi from 'joi';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  STRONG_PASSWORD_PATTERN,
} from '@shared/domain/constraints';
import { isProduction, NodeEnv, nodeEnvSchema } from './node-env.validation';

export const SEED_ADMIN_MIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;
export const SEED_ADMIN_PRODUCTION_MIN_PASSWORD_LENGTH = 12;

const KNOWN_DEFAULT_EMAILS = ['admin@email.com', 'admin@example.com'];

const KNOWN_WEAK_PASSWORDS = [
  '12345678',
  '123456789',
  '1234567890',
  '123456789012',
  'password',
  'password123',
  'admin',
  'admin123',
  'admin12345',
  'changeme',
  'change-me',
  'qwerty123',
];

export interface SeedAdminEnv {
  NODE_ENV: NodeEnv;
  SEED_ADMIN_ENABLED: boolean;
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
}

export const seedAdminValidationSchema = Joi.object<SeedAdminEnv>({
  NODE_ENV: nodeEnvSchema,

  SEED_ADMIN_ENABLED: Joi.boolean()
    .empty('')
    .when('NODE_ENV', {
      ...isProduction,
      then: Joi.boolean().default(false),
      otherwise: Joi.boolean().default(true),
    }),

  SEED_ADMIN_EMAIL: Joi.string()
    .trim()
    .empty('')
    .email()
    .max(EMAIL_MAX_LENGTH)
    .when('SEED_ADMIN_ENABLED', { is: true, then: Joi.required() })
    .when('NODE_ENV', {
      ...isProduction,
      then: Joi.string()
        .invalid(...KNOWN_DEFAULT_EMAILS)
        .insensitive()
        .messages({
          'any.invalid':
            '"SEED_ADMIN_EMAIL" must not be a known default address in production',
        }),
    }),

  SEED_ADMIN_PASSWORD: Joi.string()
    .empty('')
    .min(SEED_ADMIN_MIN_PASSWORD_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .pattern(STRONG_PASSWORD_PATTERN)
    .messages({
      'string.pattern.base':
        '"SEED_ADMIN_PASSWORD" must contain an uppercase letter, a lowercase letter, a digit, and a symbol',
    })
    .when('SEED_ADMIN_ENABLED', { is: true, then: Joi.required() })
    .when('NODE_ENV', {
      ...isProduction,
      then: Joi.string()
        .min(SEED_ADMIN_PRODUCTION_MIN_PASSWORD_LENGTH)
        .invalid(...KNOWN_WEAK_PASSWORDS)
        .insensitive()
        .messages({
          'any.invalid':
            '"SEED_ADMIN_PASSWORD" must not be a known weak or default password in production',
        }),
    }),
});
