import type { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from '@shared/presentation/filters';
import { setupExceptionHandling } from '../setup-exception-handling';

describe('setupExceptionHandling', () => {
  const createApp = () => {
    const filter = Object.create(
      AllExceptionsFilter.prototype,
    ) as AllExceptionsFilter;

    return {
      get: jest.fn((token: unknown) =>
        token === AllExceptionsFilter ? filter : undefined,
      ),
      useGlobalFilters: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<INestApplication, 'get' | 'useGlobalFilters'>
    >;
  };

  it('registers the AllExceptionsFilter resolved from the app container as the global filter', () => {
    const app = createApp();

    setupExceptionHandling(app as unknown as INestApplication);

    expect(app.get).toHaveBeenCalledWith(AllExceptionsFilter);
    expect(app.useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(app.useGlobalFilters).toHaveBeenCalledWith(
      app.get.mock.results[0]?.value,
    );
  });
});
