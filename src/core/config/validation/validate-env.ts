import type { ObjectSchema } from 'joi';

export function validateEnv<T>(
  schema: ObjectSchema<T>,
  env: NodeJS.ProcessEnv = process.env,
): T {
  const result = schema.validate(env, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (result.error) {
    throw new Error(`Config validation error: ${result.error.message}`);
  }

  return result.value;
}
