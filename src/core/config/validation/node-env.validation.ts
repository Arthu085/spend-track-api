import * as Joi from 'joi';

export type NodeEnv = 'development' | 'production' | 'test';

export const nodeEnvSchema = Joi.string()
  .valid('development', 'production', 'test')
  .default('development');

export const isProduction = { is: 'production' } as const;
