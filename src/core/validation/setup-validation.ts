import type { INestApplication } from '@nestjs/common';
import { I18nValidationExceptionFilter } from 'nestjs-i18n';
import { AppValidationPipe } from './app-validation.pipe';

export function setupValidation(app: INestApplication): void {
  app.useGlobalPipes(
    new AppValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(
    new I18nValidationExceptionFilter({ detailedErrors: false }),
  );
}
