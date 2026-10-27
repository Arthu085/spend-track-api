import { PASSWORD_MAX_LENGTH } from '@shared/domain/constraints';
import {
  SeedAdminEnv,
  seedAdminValidationSchema,
} from '../seed-admin.validation';

const STRONG_PRODUCTION_ENV = {
  NODE_ENV: 'production',
  SEED_ADMIN_ENABLED: 'true',
  SEED_ADMIN_EMAIL: 'ops@company.io',
  SEED_ADMIN_PASSWORD: 'x9!Long-Unique-Secret',
};

const validate = (env: Record<string, unknown>) =>
  seedAdminValidationSchema.validate(env, {
    abortEarly: false,
  });

describe('seedAdminValidationSchema', () => {
  describe('outside production', () => {
    it('enables the seed admin by default and requires its credentials', () => {
      const { error } = validate({ NODE_ENV: 'development' });

      expect(error?.message).toContain('"SEED_ADMIN_EMAIL" is required');
      expect(error?.message).toContain('"SEED_ADMIN_PASSWORD" is required');
    });

    it('accepts short local credentials', () => {
      const result = validate({
        NODE_ENV: 'development',
        SEED_ADMIN_EMAIL: 'admin@email.com',
        SEED_ADMIN_PASSWORD: 'Admin@123',
      });

      expect(result.error).toBeUndefined();
      expect((result.value as SeedAdminEnv).SEED_ADMIN_ENABLED).toBe(true);
    });

    it('needs no credentials when disabled', () => {
      const result = validate({
        NODE_ENV: 'test',
        SEED_ADMIN_ENABLED: 'false',
      });

      expect(result.error).toBeUndefined();
      expect((result.value as SeedAdminEnv).SEED_ADMIN_ENABLED).toBe(false);
    });

    it('rejects a malformed email', () => {
      const { error } = validate({
        NODE_ENV: 'development',
        SEED_ADMIN_EMAIL: 'not-an-email',
        SEED_ADMIN_PASSWORD: 'Admin@123',
      });

      expect(error?.message).toContain('SEED_ADMIN_EMAIL');
    });

    it('rejects a password longer than the login maximum', () => {
      const { error } = validate({
        NODE_ENV: 'development',
        SEED_ADMIN_EMAIL: 'admin@email.com',
        SEED_ADMIN_PASSWORD: 'Aa1!'.padEnd(PASSWORD_MAX_LENGTH + 1, 'p'),
      });

      expect(error?.message).toContain(
        `"SEED_ADMIN_PASSWORD" length must be less than or equal to ${PASSWORD_MAX_LENGTH}`,
      );
    });

    it.each([
      ['an uppercase letter', 'admin@123'],
      ['a lowercase letter', 'ADMIN@123'],
      ['a digit', 'Admin@abc'],
      ['a symbol', 'Admin1234'],
    ])('rejects a password without %s', (_missing, password) => {
      const { error } = validate({
        NODE_ENV: 'development',
        SEED_ADMIN_EMAIL: 'admin@email.com',
        SEED_ADMIN_PASSWORD: password,
      });

      expect(error?.message).toBe(
        '"SEED_ADMIN_PASSWORD" must contain an uppercase letter, a lowercase letter, a digit, and a symbol',
      );
    });
  });

  describe('in production', () => {
    it('disables the seed admin by default, treating empty values as unset', () => {
      const result = validate({
        NODE_ENV: 'production',
        SEED_ADMIN_ENABLED: '',
        SEED_ADMIN_EMAIL: '',
        SEED_ADMIN_PASSWORD: '',
      });

      expect(result.error).toBeUndefined();
      expect((result.value as SeedAdminEnv).SEED_ADMIN_ENABLED).toBe(false);
    });

    it('requires credentials when explicitly enabled', () => {
      const { error } = validate({
        NODE_ENV: 'production',
        SEED_ADMIN_ENABLED: 'true',
      });

      expect(error?.message).toContain('"SEED_ADMIN_EMAIL" is required');
      expect(error?.message).toContain('"SEED_ADMIN_PASSWORD" is required');
    });

    it('accepts strong credentials', () => {
      const { error } = validate(STRONG_PRODUCTION_ENV);

      expect(error).toBeUndefined();
    });

    it('rejects the known default email regardless of case', () => {
      const { error } = validate({
        ...STRONG_PRODUCTION_ENV,
        SEED_ADMIN_EMAIL: 'Admin@Email.com',
      });

      expect(error?.message).toContain(
        '"SEED_ADMIN_EMAIL" must not be a known default address in production',
      );
    });

    it('still requires every character class', () => {
      const { error } = validate({
        ...STRONG_PRODUCTION_ENV,
        SEED_ADMIN_PASSWORD: 'x9-long-unique-secret',
      });

      expect(error?.message).toBe(
        '"SEED_ADMIN_PASSWORD" must contain an uppercase letter, a lowercase letter, a digit, and a symbol',
      );
    });

    it('rejects a strong password shorter than 12 characters', () => {
      const { error } = validate({
        ...STRONG_PRODUCTION_ENV,
        SEED_ADMIN_PASSWORD: 'Admin@123',
      });

      expect(error?.message).toContain(
        '"SEED_ADMIN_PASSWORD" length must be at least 12 characters long',
      );
    });

    it.each(['12345678', 'Password123', '123456789012'])(
      'rejects the weak password %p',
      (password) => {
        const { error } = validate({
          ...STRONG_PRODUCTION_ENV,
          SEED_ADMIN_PASSWORD: password,
        });

        expect(error?.message).toContain('SEED_ADMIN_PASSWORD');
      },
    );

    it('rejects default credentials even while the seed admin is disabled', () => {
      const { error } = validate({
        NODE_ENV: 'production',
        SEED_ADMIN_EMAIL: 'admin@email.com',
        SEED_ADMIN_PASSWORD: '12345678',
      });

      expect(error?.message).toContain('SEED_ADMIN_EMAIL');
      expect(error?.message).toContain('SEED_ADMIN_PASSWORD');
    });
  });
});
