import { Injectable, Logger } from '@nestjs/common';
import { isDevelopment, isLoggingEnabled } from '../config/env/env.helpers';

@Injectable()
export class AppLogger {
  private readonly logger = new Logger('AppLogger');
  private readonly isDev = isDevelopment;
  private readonly isEnabled = isLoggingEnabled;

  log(message: string, context?: string) {
    if (!this.isEnabled) return;
    this.logger.log(this.format(message, context));
  }

  warn(message: string, context?: string) {
    if (!this.isEnabled) return;
    this.logger.warn(this.format(message, context));
  }

  error(message: string, trace?: string, context?: string) {
    if (!this.isEnabled) return;

    this.logger.error(
      this.format(message, context),
      this.isDev ? trace : undefined,
    );
  }

  debug(message: string, context?: string) {
    if (!this.isDev || !this.isEnabled) return;

    this.logger.debug(this.format(message, context));
  }

  private format(message: string, context?: string) {
    return context ? `[${context}] ${message}` : message;
  }
}
