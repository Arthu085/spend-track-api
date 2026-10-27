import type { INestApplication } from '@nestjs/common';
import { I18nValidationExceptionFilter } from 'nestjs-i18n';
import { AppValidationPipe } from '../app-validation.pipe';
import { setupValidation } from '../setup-validation';

describe('setupValidation', () => {
  const createApp = () =>
    ({
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
    }) as unknown as jest.Mocked<
      Pick<INestApplication, 'useGlobalPipes' | 'useGlobalFilters'>
    >;

  it('registers the app validation pipe globally', () => {
    const app = createApp();

    setupValidation(app as unknown as INestApplication);

    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(app.useGlobalPipes).toHaveBeenCalledWith(
      expect.any(AppValidationPipe),
    );
  });

  it('registers the i18n validation exception filter globally', () => {
    const app = createApp();

    setupValidation(app as unknown as INestApplication);

    expect(app.useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(app.useGlobalFilters).toHaveBeenCalledWith(
      expect.any(I18nValidationExceptionFilter),
    );
  });

  it('strips unknown properties instead of rejecting them', () => {
    const app = createApp();

    setupValidation(app as unknown as INestApplication);

    const [pipe] = app.useGlobalPipes.mock.calls[0] as [AppValidationPipe];

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
