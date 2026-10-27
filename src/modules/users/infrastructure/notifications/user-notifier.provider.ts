import { Logger } from '@nestjs/common';
import { AppConfigService } from '@core/config';
import type { UserNotifier } from '../../application/ports/user-notifier.port';
import { LoggingUserNotifier } from './logging-user-notifier';
import { SmtpUserNotifier } from './smtp-user-notifier';

const logger = new Logger('UserNotifierProvider');

export function selectUserNotifier(
  config: AppConfigService,
  logging: LoggingUserNotifier,
  smtp: SmtpUserNotifier,
): UserNotifier {
  if (config.mail.transport === 'smtp') {
    logger.log('User notifier transport: smtp');

    return smtp;
  }

  logger.log('User notifier transport: log');

  return logging;
}
