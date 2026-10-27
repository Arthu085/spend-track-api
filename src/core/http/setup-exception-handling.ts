import type { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from '@shared/presentation/filters';

export function setupExceptionHandling(app: INestApplication): void {
  app.useGlobalFilters(app.get(AllExceptionsFilter));
}
