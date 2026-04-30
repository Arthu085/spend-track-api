import { NotFoundException } from '@nestjs/common';
import { AppNotFoundExceptionOptions } from './types/app-not-found.execption.type';

export class AppNotFoundException extends NotFoundException {
  constructor(options: AppNotFoundExceptionOptions) {
    super(
      `${options.resource} não ${options.gender === 'M' ? 'encontrado' : 'encontrada'}.`,
    );
  }
}
