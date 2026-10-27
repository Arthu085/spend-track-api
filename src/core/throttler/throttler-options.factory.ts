import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { SECOND_IN_MS } from '@shared/application/time';
import { PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY } from '@shared/presentation/throttling';

export interface ThrottleBudget {
  ttl: number;
  limit: number;
}

export interface BuildThrottlerOptionsParams extends ThrottleBudget {
  auth: ThrottleBudget;
  storage?: ThrottlerStorage;
}

const reflector = new Reflector();

const isPublicAuthFlow = (context: ExecutionContext): boolean =>
  reflector.getAllAndOverride<boolean | undefined>(
    PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY,
    [context.getHandler(), context.getClass()],
  ) === true;

export const buildThrottlerOptions = ({
  ttl,
  limit,
  auth,
  storage,
}: BuildThrottlerOptionsParams): ThrottlerModuleOptions => {
  const budgetFor = (context: ExecutionContext): ThrottleBudget =>
    isPublicAuthFlow(context) ? auth : { ttl, limit };

  return {
    throttlers: [
      {
        ttl: (context) => budgetFor(context).ttl * SECOND_IN_MS,
        limit: (context) => budgetFor(context).limit,
      },
    ],
    errorMessage: 'errors.too_many_requests',
    storage,
  };
};
