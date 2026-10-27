import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import type { EmailSendLogRepository } from '../../../domain/repositories/email-send-log.repository';
import { ConsumeEmailQuotaUseCase } from '../consume-email-quota.use-case';

function buildConfig(
  passwordResetDailyLimit: number,
  emailConfirmationDailyLimit: number,
  emailChangeNoticeDailyLimit = 0,
): AppConfigService {
  return {
    emailQuota: {
      passwordResetDailyLimit,
      emailConfirmationDailyLimit,
      emailChangeNoticeDailyLimit,
    },
  } as unknown as AppConfigService;
}

describe('ConsumeEmailQuotaUseCase', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('limit resolution per EmailType', () => {
    it('resolves PASSWORD_RESET against the password-reset limit, not the email-confirmation one', async () => {
      const consumeDailySlot = jest.fn().mockResolvedValue(1);

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(3, 9),
      );

      const decision = await useCase.tryConsume({
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
      });

      expect(decision.limit).toBe(3);
      expect(consumeDailySlot).toHaveBeenCalledWith(
        expect.objectContaining({
          emailType: EmailType.PASSWORD_RESET,
          limit: 3,
        }),
      );
    });

    it('resolves EMAIL_CONFIRMATION against the email-confirmation limit, not the password-reset one', async () => {
      const consumeDailySlot = jest.fn().mockResolvedValue(1);

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(3, 9),
      );

      const decision = await useCase.tryConsume({
        emailType: EmailType.EMAIL_CONFIRMATION,
        recipient: 'jane@example.com',
      });

      expect(decision.limit).toBe(9);
      expect(consumeDailySlot).toHaveBeenCalledWith(
        expect.objectContaining({
          emailType: EmailType.EMAIL_CONFIRMATION,
          limit: 9,
        }),
      );
    });

    it('resolves EMAIL_CHANGE_NOTICE against the email-change notice limit', async () => {
      const consumeDailySlot = jest.fn().mockResolvedValue(1);

      const useCase = new ConsumeEmailQuotaUseCase(
        { consumeDailySlot } as unknown as EmailSendLogRepository,
        buildConfig(3, 9, 2),
      );

      const decision = await useCase.tryConsume({
        emailType: EmailType.EMAIL_CHANGE_NOTICE,
        recipient: 'jane@example.com',
      });

      expect(decision.limit).toBe(2);
      expect(consumeDailySlot).toHaveBeenCalledWith(
        expect.objectContaining({
          emailType: EmailType.EMAIL_CHANGE_NOTICE,
          limit: 2,
        }),
      );
    });
  });

  describe('limit <= 0 (kill switch)', () => {
    it('short-circuits to denied without calling the repository or normalizing the recipient when the limit is 0', async () => {
      const consumeDailySlot = jest.fn();

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(0, 5),
      );

      const decision = await useCase.tryConsume({
        emailType: EmailType.PASSWORD_RESET,
        recipient: '  Jane@Example.COM  ',
      });

      expect(decision).toEqual({
        allowed: false,
        reason: 'DISABLED',
        used: 0,
        limit: 0,
      });
      expect(consumeDailySlot).not.toHaveBeenCalled();
    });

    it('short-circuits to denied without calling the repository when the limit is negative', async () => {
      const consumeDailySlot = jest.fn();

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(-1, 5),
      );

      const decision = await useCase.tryConsume({
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
      });

      expect(decision).toEqual({
        allowed: false,
        reason: 'DISABLED',
        used: 0,
        limit: -1,
      });
      expect(consumeDailySlot).not.toHaveBeenCalled();
    });
  });

  describe('recipient normalization', () => {
    it('trims and lowercases the recipient before calling the repository', async () => {
      const consumeDailySlot = jest.fn().mockResolvedValue(1);

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(5, 5),
      );

      await useCase.tryConsume({
        emailType: EmailType.PASSWORD_RESET,
        recipient: '  Admin@Gmail.COM  ',
      });

      expect(consumeDailySlot).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'admin@gmail.com' }),
      );
    });
  });

  describe('repository returns a number', () => {
    it('reports allowed with the returned count as "used"', async () => {
      const consumeDailySlot = jest.fn().mockResolvedValue(3);

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(5, 5),
      );

      const decision = await useCase.tryConsume({
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
      });

      expect(decision).toEqual({ allowed: true, used: 3, limit: 5 });
    });
  });

  describe('repository returns null (quota exhausted)', () => {
    it('reports denied with used === limit and logs a structured warning with a masked recipient', async () => {
      const consumeDailySlot = jest.fn().mockResolvedValue(null);

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(5, 5),
      );

      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      const decision = await useCase.tryConsume({
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
      });

      expect(decision).toEqual({
        allowed: false,
        reason: 'EXHAUSTED',
        used: 5,
        limit: 5,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith({
        msg: 'Email send quota exhausted',
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'j***@example.com',
        limit: 5,
        day: expect.any(String) as string,
      });
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(
        'jane@example.com',
      );
    });
  });

  describe('repository throws (fail-closed)', () => {
    it('masks recipient emails echoed back inside the error message', async () => {
      const consumeDailySlot = jest
        .fn()
        .mockRejectedValue(
          new Error('lock timeout while counting jane@example.com'),
        );

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(5, 5),
      );

      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await useCase.tryConsume({
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'jane@example.com',
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'lock timeout while counting j***@example.com',
        }),
      );
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
        'jane@example.com',
      );
    });

    it('denies with reason UNAVAILABLE and never propagates an Error', async () => {
      const consumeDailySlot = jest
        .fn()
        .mockRejectedValue(new Error('db down'));

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(5, 5),
      );

      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(
        useCase.tryConsume({
          emailType: EmailType.PASSWORD_RESET,
          recipient: 'jane@example.com',
        }),
      ).resolves.toEqual({
        allowed: false,
        reason: 'UNAVAILABLE',
        used: 0,
        limit: 5,
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith({
        msg: 'Email send quota unavailable; send denied',
        emailType: EmailType.PASSWORD_RESET,
        recipient: 'j***@example.com',
        error: 'db down',
      });
    });

    it('denies with reason UNAVAILABLE and logs via String(error) for a non-Error rejection', async () => {
      const consumeDailySlot = jest
        .fn()
        .mockRejectedValue('unexpected failure');

      const repository = {
        consumeDailySlot,
      } as unknown as EmailSendLogRepository;

      const useCase = new ConsumeEmailQuotaUseCase(
        repository,
        buildConfig(5, 5),
      );

      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(
        useCase.tryConsume({
          emailType: EmailType.EMAIL_CONFIRMATION,
          recipient: 'jane@example.com',
        }),
      ).resolves.toEqual({
        allowed: false,
        reason: 'UNAVAILABLE',
        used: 0,
        limit: 5,
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'unexpected failure' }),
      );
    });
  });
});
