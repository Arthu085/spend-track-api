import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@shared/domain/constraints';
import { ForgotPasswordDto } from '../forgot-password.dto';
import { LoginDto } from '../login.dto';
import { ResetPasswordDto } from '../reset-password.dto';

async function constraintsFor(
  dtoClass: new () => object,
  payload: Record<string, unknown>,
  property: string,
): Promise<Record<string, string> | undefined> {
  const errors = await validate(plainToInstance(dtoClass, payload));

  return errors.find((error) => error.property === property)?.constraints;
}

function strongPasswordOfLength(length: number): string {
  return 'Aa1!'.padEnd(length, 'p');
}

const OVERSIZED_EMAIL = `${'a'.repeat(64)}@${'b'.repeat(EMAIL_MAX_LENGTH)}.com`;

describe('LoginDto length constraints', () => {
  it('accepts a password at the maximum length', async () => {
    const errors = await validate(
      plainToInstance(LoginDto, {
        email: 'admin@example.com',
        password: 'p'.repeat(PASSWORD_MAX_LENGTH),
      }),
    );

    expect(errors).toHaveLength(0);
  });

  // Login only caps the password; enforcing the minimum here would lock out
  // accounts whose password predates the current policy.
  it('does not enforce the password minimum', async () => {
    const errors = await validate(
      plainToInstance(LoginDto, {
        email: 'admin@example.com',
        password: 'p'.repeat(PASSWORD_MIN_LENGTH - 1),
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects a password one character over the maximum', async () => {
    const constraints = await constraintsFor(
      LoginDto,
      {
        email: 'admin@example.com',
        password: 'p'.repeat(PASSWORD_MAX_LENGTH + 1),
      },
      'password',
    );

    expect(constraints).toHaveProperty('maxLength');
  });

  it('does not enforce the password strength rule', async () => {
    const errors = await validate(
      plainToInstance(LoginDto, {
        email: 'admin@example.com',
        password: '12345678',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects an oversized email', async () => {
    const constraints = await constraintsFor(
      LoginDto,
      { email: OVERSIZED_EMAIL, password: 'StrongPass123!' },
      'email',
    );

    expect(constraints).toHaveProperty('maxLength');
  });
});

describe('ResetPasswordDto length constraints', () => {
  const token = 'a1b2c3d4.secret';

  it('accepts passwords at the minimum and maximum lengths', async () => {
    for (const length of [PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]) {
      const errors = await validate(
        plainToInstance(ResetPasswordDto, {
          token,
          password: strongPasswordOfLength(length),
        }),
      );

      expect(errors).toHaveLength(0);
    }
  });

  it('rejects a password one character under the minimum', async () => {
    const constraints = await constraintsFor(
      ResetPasswordDto,
      { token, password: strongPasswordOfLength(PASSWORD_MIN_LENGTH - 1) },
      'password',
    );

    expect(constraints).toHaveProperty('minLength');
  });

  it('rejects a password one character over the maximum', async () => {
    const constraints = await constraintsFor(
      ResetPasswordDto,
      { token, password: strongPasswordOfLength(PASSWORD_MAX_LENGTH + 1) },
      'password',
    );

    expect(constraints).toHaveProperty('maxLength');
  });
});

describe('ResetPasswordDto password strength', () => {
  const token = 'a1b2c3d4.secret';

  it('accepts a password with every character class', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, { token, password: 'N3wStrongPass!' }),
    );

    expect(errors).toHaveLength(0);
  });

  it.each([
    { missing: 'a lowercase letter', password: 'STRONGPASS123!' },
    { missing: 'an uppercase letter', password: 'strongpass123!' },
    { missing: 'a digit', password: 'StrongPass!!!' },
    { missing: 'a symbol', password: 'StrongPass123' },
  ])('rejects a password without $missing', async ({ password }) => {
    const constraints = await constraintsFor(
      ResetPasswordDto,
      { token, password },
      'password',
    );

    expect(Object.keys(constraints ?? {})).toEqual(['matches']);
  });
});

describe('ForgotPasswordDto length constraints', () => {
  it('rejects an oversized email', async () => {
    const constraints = await constraintsFor(
      ForgotPasswordDto,
      { email: OVERSIZED_EMAIL },
      'email',
    );

    expect(constraints).toHaveProperty('maxLength');
  });
});
