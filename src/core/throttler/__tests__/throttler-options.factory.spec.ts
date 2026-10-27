import type { ExecutionContext } from '@nestjs/common';
import type {
  ThrottlerModuleOptions,
  ThrottlerOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { PublicAuthFlowThrottle } from '@shared/presentation/throttling';
import { buildThrottlerOptions } from '../throttler-options.factory';

class RegularController {
  handler(): void {}
}

class AuthFlowController {
  @PublicAuthFlowThrottle()
  handler(): void {}
}

@PublicAuthFlowThrottle()
class AuthFlowClassController {
  handler(): void {}
}

type ControllerClass = new () => { handler(): void };

const contextFor = (controller: ControllerClass) => {
  const handler = Object.getOwnPropertyDescriptor(
    controller.prototype,
    'handler',
  )?.value as object;

  return {
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
};

const resolve = async (
  options: ThrottlerModuleOptions,
  context: ExecutionContext,
) => {
  const [{ ttl, limit }] = (options as { throttlers: ThrottlerOptions[] })
    .throttlers;

  return {
    ttl: typeof ttl === 'function' ? await ttl(context) : ttl,
    limit: typeof limit === 'function' ? await limit(context) : limit,
  };
};

describe('buildThrottlerOptions', () => {
  const options = buildThrottlerOptions({
    ttl: 60,
    limit: 100,
    auth: { ttl: 30, limit: 3 },
  });

  it('defines a single default throttler', () => {
    const { throttlers } = options as { throttlers: ThrottlerOptions[] };

    expect(throttlers).toHaveLength(1);
    expect(throttlers[0].name).toBeUndefined();
  });

  it('applies the global budget, with ttl in milliseconds, to regular routes', async () => {
    await expect(
      resolve(options, contextFor(RegularController)),
    ).resolves.toEqual({ ttl: 60000, limit: 100 });
  });

  it('applies the auth budget to routes marked with PublicAuthFlowThrottle()', async () => {
    await expect(
      resolve(options, contextFor(AuthFlowController)),
    ).resolves.toEqual({ ttl: 30000, limit: 3 });
  });

  it('applies the auth budget when the marker is on the controller class', async () => {
    await expect(
      resolve(options, contextFor(AuthFlowClassController)),
    ).resolves.toEqual({ ttl: 30000, limit: 3 });
  });

  it('rejects with an i18n key so the exception filter localizes the 429 message', () => {
    expect((options as { errorMessage?: unknown }).errorMessage).toBe(
      'errors.too_many_requests',
    );
  });

  it('leaves storage unset so @nestjs/throttler falls back to in-memory counters', () => {
    expect((options as { storage?: unknown }).storage).toBeUndefined();
  });

  it('passes a shared storage through to the throttler module', () => {
    const storage: ThrottlerStorage = { increment: jest.fn() };

    const withStorage = buildThrottlerOptions({
      ttl: 60,
      limit: 100,
      auth: { ttl: 30, limit: 3 },
      storage,
    });

    expect((withStorage as { storage?: unknown }).storage).toBe(storage);
  });
});
