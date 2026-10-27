import type { AppConfigService } from '@core/config';
import type { LoggingUserNotifier } from '../logging-user-notifier';
import type { SmtpUserNotifier } from '../smtp-user-notifier';
import { selectUserNotifier } from '../user-notifier.provider';

describe('selectUserNotifier', () => {
  const logging = { name: 'logging' } as unknown as LoggingUserNotifier;
  const smtp = { name: 'smtp' } as unknown as SmtpUserNotifier;

  const buildConfig = (transport: string): AppConfigService =>
    ({ mail: { transport } }) as unknown as AppConfigService;

  it('returns the SMTP notifier when the configured transport is "smtp"', () => {
    const notifier = selectUserNotifier(buildConfig('smtp'), logging, smtp);

    expect(notifier).toBe(smtp);
  });

  it('returns the logging notifier when the configured transport is "log"', () => {
    const notifier = selectUserNotifier(buildConfig('log'), logging, smtp);

    expect(notifier).toBe(logging);
  });

  it('returns the logging notifier for any transport value other than "smtp"', () => {
    const notifier = selectUserNotifier(
      buildConfig('unsupported'),
      logging,
      smtp,
    );

    expect(notifier).toBe(logging);
  });
});
