import 'reflect-metadata';
import {
  AUDIT_METADATA_KEY,
  PUBLIC_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
} from '@shared/presentation/metadata';
import { PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY } from '@shared/presentation/throttling';
import type { RequestPasswordResetUseCase } from '../../../application/use-cases/request-password-reset.use-case';
import type { ResetPasswordUseCase } from '../../../application/use-cases/reset-password.use-case';
import { PasswordRecoveryController } from '../password-recovery.controller';

const controllerHandlers =
  PasswordRecoveryController.prototype as unknown as Record<string, object>;

function buildController(
  overrides: Partial<{
    requestPasswordResetUseCase: Partial<RequestPasswordResetUseCase>;
    resetPasswordUseCase: Partial<ResetPasswordUseCase>;
  }> = {},
): PasswordRecoveryController {
  return new PasswordRecoveryController(
    (overrides.requestPasswordResetUseCase ??
      {}) as RequestPasswordResetUseCase,
    (overrides.resetPasswordUseCase ?? {}) as ResetPasswordUseCase,
  );
}

describe('PasswordRecoveryController', () => {
  describe('forgotPassword', () => {
    it('delegates the email to the use-case and returns null', async () => {
      const execute = jest.fn().mockResolvedValue(undefined);

      const controller = buildController({
        requestPasswordResetUseCase: { execute },
      });

      const result = await controller.forgotPassword({
        email: 'jane@example.com',
      });

      expect(execute).toHaveBeenCalledWith({ email: 'jane@example.com' });
      expect(result).toBeNull();
    });
  });

  describe('resetPassword', () => {
    it('delegates the token and new password to the use-case and returns null', async () => {
      const execute = jest.fn().mockResolvedValue(undefined);

      const controller = buildController({
        resetPasswordUseCase: { execute },
      });

      const result = await controller.resetPassword({
        token: 'uuid.secret',
        password: 'NewStrongPass123!',
      });

      expect(execute).toHaveBeenCalledWith({
        token: 'uuid.secret',
        password: 'NewStrongPass123!',
      });
      expect(result).toBeNull();
    });
  });

  describe('endpoint() route metadata', () => {
    it('forgotPassword is public, audited, and carries a success message', () => {
      const handler = controllerHandlers.forgotPassword;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(
        'Auth.forgot_password',
      );
      expect(Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, handler)).toBe(
        'auth.success.password_reset_requested',
      );
    });

    it('resetPassword is public, audited, and carries a success message', () => {
      const handler = controllerHandlers.resetPassword;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(
        'Auth.reset_password',
      );
      expect(Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, handler)).toBe(
        'auth.success.password_reset',
      );
    });

    it.each(['forgotPassword', 'resetPassword'])(
      '%s uses the auth flow throttle budget',
      (name) => {
        expect(
          Reflect.getMetadata(
            PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY,
            controllerHandlers[name],
          ),
        ).toBe(true);
      },
    );
  });
});
