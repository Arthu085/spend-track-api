import 'reflect-metadata';
import {
  AUDIT_METADATA_KEY,
  PUBLIC_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '@shared/presentation/metadata';
import { PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY } from '@shared/presentation/throttling';
import type { ConfirmEmailUseCase } from '../../../application/use-cases/confirm-email.use-case';
import type { ResendEmailConfirmationUseCase } from '../../../application/use-cases/resend-email-confirmation.use-case';
import { UserEmailConfirmationController } from '../user-email-confirmation.controller';

const controllerHandlers =
  UserEmailConfirmationController.prototype as unknown as Record<
    string,
    object
  >;

describe('UserEmailConfirmationController', () => {
  describe('confirmEmail', () => {
    it('delegates the token to the use-case and returns null', async () => {
      const execute = jest.fn().mockResolvedValue(undefined);

      const controller = new UserEmailConfirmationController(
        { execute } as unknown as ConfirmEmailUseCase,
        {} as ResendEmailConfirmationUseCase,
      );

      const result = await controller.confirmEmail({ token: 'uuid.secret' });

      expect(execute).toHaveBeenCalledWith({ token: 'uuid.secret' });
      expect(result).toBeNull();
    });
  });

  describe('resendConfirmation', () => {
    it('delegates the email to the use-case and returns null', async () => {
      const execute = jest.fn().mockResolvedValue(undefined);

      const controller = new UserEmailConfirmationController(
        {} as ConfirmEmailUseCase,
        { execute } as unknown as ResendEmailConfirmationUseCase,
      );

      const result = await controller.resendConfirmation({
        email: 'jane@example.com',
      });

      expect(execute).toHaveBeenCalledWith({ email: 'jane@example.com' });
      expect(result).toBeNull();
    });
  });

  describe('endpoint() route metadata', () => {
    it('confirmEmail is public, audited, throttled, and carries a success message', () => {
      const handler = controllerHandlers.confirmEmail;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(
        'User.confirm_email',
      );
      expect(Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, handler)).toBe(
        'users.success.email_confirmed',
      );
      expect(
        Reflect.getMetadata(PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY, handler),
      ).toBe(true);
    });

    it('resendConfirmation is public, audited, throttled, and carries a success message', () => {
      const handler = controllerHandlers.resendConfirmation;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(
        'User.resend_confirmation',
      );
      expect(Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, handler)).toBe(
        'users.success.confirmation_sent',
      );
      expect(
        Reflect.getMetadata(PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY, handler),
      ).toBe(true);
    });
  });
});
