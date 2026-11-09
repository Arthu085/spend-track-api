import type { INestApplication } from '@nestjs/common';
import { I18nValidationExceptionFilter } from 'nestjs-i18n';
import { mockOf } from '@test/support/mocks/mock-of';
import { AppValidationPipe } from '../app-validation.pipe';
import { buildValidationErrorBody } from '../build-validation-error-body';
import { setupValidation } from '../setup-validation';

describe('setupValidation', () => {
  const createApp = () => {
    const useGlobalPipes = jest.fn();
    const useGlobalFilters = jest.fn();

    const app = mockOf<INestApplication>({
      useGlobalPipes,
      useGlobalFilters,
    });

    return { app, useGlobalPipes, useGlobalFilters };
  };

  it('registers the app validation pipe globally', () => {
    const { app, useGlobalPipes } = createApp();

    setupValidation(app);

    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledWith(expect.any(AppValidationPipe));
  });

  it('registers the i18n validation exception filter globally', () => {
    const { app, useGlobalFilters } = createApp();

    setupValidation(app);

    expect(useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(useGlobalFilters).toHaveBeenCalledWith(
      expect.any(I18nValidationExceptionFilter),
    );
  });

  it('flattens validation errors into the documented error body', () => {
    const { app, useGlobalFilters } = createApp();

    setupValidation(app);

    const [filter] = useGlobalFilters.mock.calls[0] as [
      I18nValidationExceptionFilter,
    ];

    expect(
      (filter as unknown as { options: Record<string, unknown> }).options,
    ).toEqual({
      detailedErrors: false,
      responseBodyFormatter: buildValidationErrorBody,
    });
  });

  it('strips unknown properties instead of rejecting them', () => {
    const { app, useGlobalPipes } = createApp();

    setupValidation(app);

    const [pipe] = useGlobalPipes.mock.calls[0] as [AppValidationPipe];

    const options = (
      pipe as unknown as {
        validatorOptions: {
          whitelist?: boolean;
          forbidNonWhitelisted?: boolean;
        };
      }
    ).validatorOptions;

    expect(options.whitelist).toBe(true);
    expect(options.forbidNonWhitelisted).toBeUndefined();
  });
});
