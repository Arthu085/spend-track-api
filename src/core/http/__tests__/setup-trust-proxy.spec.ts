import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfigService } from '@core/config';
import { setupTrustProxy } from '../setup-trust-proxy';

describe('setupTrustProxy', () => {
  it('applies the configured trust proxy setting to the Express app', () => {
    const config = { app: { trustProxy: ['loopback'] } };

    const app = {
      get: jest.fn((token: unknown) =>
        token === AppConfigService ? config : undefined,
      ),
      set: jest.fn(),
    };

    setupTrustProxy(app as unknown as NestExpressApplication);

    expect(app.get).toHaveBeenCalledWith(AppConfigService);
    expect(app.set).toHaveBeenCalledWith('trust proxy', ['loopback']);
  });
});
