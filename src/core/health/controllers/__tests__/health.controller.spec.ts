import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';
import {
  AUDIT_METADATA_KEY,
  PUBLIC_METADATA_KEY,
} from '@shared/presentation/metadata';
import { mockOf } from '@test/support/mocks/mock-of';
import type { ReadinessService } from '../../services/readiness.service';
import { HealthController } from '../health.controller';

const controllerHandlers = HealthController.prototype as unknown as Record<
  string,
  object
>;

describe('HealthController', () => {
  const isReady = jest.fn<Promise<boolean>, []>();

  const controller = new HealthController(
    mockOf<ReadinessService>({ isReady }),
  );

  beforeEach(() => {
    isReady.mockReset();
  });

  it.each(['live', 'ready'])(
    '%s is public, unthrottled, and unaudited',
    (handler) => {
      const target = controllerHandlers[handler];

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, target)).toBe(true);
      expect(Reflect.getMetadata(`${THROTTLER_SKIP}default`, target)).toBe(
        true,
      );
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, target)).toBeUndefined();
    },
  );

  it('reports liveness without checking readiness', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(isReady).not.toHaveBeenCalled();
  });

  it('reports readiness when the readiness check passes', async () => {
    isReady.mockResolvedValue(true);

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });

  it('throws 503 with a translatable key when the readiness check fails', async () => {
    isReady.mockResolvedValue(false);

    const error = await controller.ready().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).message).toBe(
      'errors.service_unavailable',
    );
  });
});
