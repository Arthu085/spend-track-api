import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '@shared/domain/constraints';
import { EmailField } from '../email-field.decorator';

class EmailFieldTestDto {
  @EmailField({ example: 'user@email.com' })
  email!: string;
}

describe('EmailField', () => {
  it('passes validation for a valid email', async () => {
    const dto = plainToInstance(EmailFieldTestDto, {
      email: 'user@email.com',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('trims surrounding whitespace before validating and keeps the casing', async () => {
    const dto = plainToInstance(EmailFieldTestDto, {
      email: '  Admin@Email.com \t',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('Admin@Email.com');
  });

  it('fails validation for a whitespace-only value', async () => {
    const dto = plainToInstance(EmailFieldTestDto, { email: '   ' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('fails validation for a non-string value without throwing', async () => {
    const dto = plainToInstance(EmailFieldTestDto, { email: 123 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('does not count surrounding whitespace toward the length limits', async () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
    const padded = `  ${email}  `;
    const dto = plainToInstance(EmailFieldTestDto, { email: padded });

    const errors = await validate(dto);

    expect(padded.length).toBeGreaterThan(EMAIL_MAX_LENGTH);
    expect(errors).toHaveLength(0);
  });
});
