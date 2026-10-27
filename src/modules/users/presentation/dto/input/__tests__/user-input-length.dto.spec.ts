import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
} from '@shared/domain/constraints';
import { ChangeOwnPasswordDto } from '../change-own-password.dto';
import { CreateUserDto } from '../create-user.dto';
import { ResendEmailConfirmationDto } from '../resend-email-confirmation.dto';
import { UpdateOwnProfileDto } from '../update-own-profile.dto';
import { UpdateUserDto } from '../update-user.dto';

// Builds a syntactically valid address of an exact length: a 64-char local
// part (the RFC maximum) plus as many domain labels as needed.
function emailOfLength(length: number): string {
  const local = 'a'.repeat(64);
  const tld = '.com';
  const labels: string[] = [];
  let remaining = length - local.length - 1 - tld.length;

  while (remaining > 0) {
    const size = Math.min(63, remaining);

    labels.push('b'.repeat(size));
    remaining -= size + 1;
  }

  return `${local}@${labels.join('.')}${tld}`;
}

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

const MISSING_CHARACTER_CLASSES = [
  { missing: 'a lowercase letter', password: 'STRONGPASS123!' },
  { missing: 'an uppercase letter', password: 'strongpass123!' },
  { missing: 'a digit', password: 'StrongPass!!!' },
  { missing: 'a symbol', password: 'StrongPass123' },
];

const VALID_USER = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'StrongPass123!',
  roleUuids: ['1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b'],
};

describe.each([
  ['CreateUserDto', CreateUserDto],
  ['UpdateUserDto', UpdateUserDto],
  ['UpdateOwnProfileDto', UpdateOwnProfileDto],
] as const)('%s length constraints', (_name, dtoClass) => {
  it('accepts a single-character name and a name at the maximum length', async () => {
    for (const name of ['J', 'n'.repeat(USER_NAME_MAX_LENGTH)]) {
      const errors = await validate(
        plainToInstance(dtoClass, { ...VALID_USER, name }),
      );

      expect(errors).toHaveLength(0);
    }
  });

  it.each(['', '   ', '\t\n'])(
    'rejects an empty or whitespace-only name (%j)',
    async (name) => {
      const constraints = await constraintsFor(
        dtoClass,
        { ...VALID_USER, name },
        'name',
      );

      expect(constraints).toHaveProperty('matches');
    },
  );

  it('rejects a name one character over the maximum', async () => {
    const constraints = await constraintsFor(
      dtoClass,
      { ...VALID_USER, name: 'n'.repeat(USER_NAME_MAX_LENGTH + 1) },
      'name',
    );

    expect(constraints).toHaveProperty('maxLength');
  });

  it('accepts the longest valid email and rejects an oversized one', async () => {
    const longest = await validate(
      plainToInstance(dtoClass, {
        ...VALID_USER,
        email: emailOfLength(EMAIL_MAX_LENGTH - 1),
      }),
    );

    expect(longest).toHaveLength(0);

    const constraints = await constraintsFor(
      dtoClass,
      { ...VALID_USER, email: emailOfLength(EMAIL_MAX_LENGTH + 1) },
      'email',
    );

    expect(constraints).toHaveProperty('maxLength');
  });
});

describe('CreateUserDto password length', () => {
  it('accepts passwords at the minimum and maximum lengths', async () => {
    for (const length of [PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]) {
      const errors = await validate(
        plainToInstance(CreateUserDto, {
          ...VALID_USER,
          password: strongPasswordOfLength(length),
        }),
      );

      expect(errors).toHaveLength(0);
    }
  });

  it('rejects a password one character under the minimum', async () => {
    const constraints = await constraintsFor(
      CreateUserDto,
      {
        ...VALID_USER,
        password: strongPasswordOfLength(PASSWORD_MIN_LENGTH - 1),
      },
      'password',
    );

    expect(constraints).toHaveProperty('minLength');
  });

  it('rejects a password one character over the maximum', async () => {
    const constraints = await constraintsFor(
      CreateUserDto,
      {
        ...VALID_USER,
        password: strongPasswordOfLength(PASSWORD_MAX_LENGTH + 1),
      },
      'password',
    );

    expect(constraints).toHaveProperty('maxLength');
  });
});

describe.each<{
  dtoName: string;
  dtoClass: new () => object;
  property: string;
  base: Record<string, unknown>;
}>([
  {
    dtoName: 'CreateUserDto',
    dtoClass: CreateUserDto,
    property: 'password',
    base: VALID_USER,
  },
  {
    dtoName: 'ChangeOwnPasswordDto',
    dtoClass: ChangeOwnPasswordDto,
    property: 'newPassword',
    base: { currentPassword: 'old-password' },
  },
])('$dtoName $property strength', ({ dtoClass, property, base }) => {
  it('accepts a password with every character class', async () => {
    const errors = await validate(
      plainToInstance(dtoClass, { ...base, [property]: 'N3wStrongPass!' }),
    );

    expect(errors).toHaveLength(0);
  });

  it.each(MISSING_CHARACTER_CLASSES)(
    'rejects a password without $missing',
    async ({ password }) => {
      const constraints = await constraintsFor(
        dtoClass,
        { ...base, [property]: password },
        property,
      );

      expect(Object.keys(constraints ?? {})).toEqual(['matches']);
    },
  );
});

describe('ChangeOwnPasswordDto', () => {
  // The current password predates the strength rule, so it is only capped.
  it('accepts a current password that fails the strength rule', async () => {
    const errors = await validate(
      plainToInstance(ChangeOwnPasswordDto, {
        currentPassword: '12345678',
        newPassword: 'N3wStrongPass!',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('accepts new passwords at the minimum and maximum lengths', async () => {
    for (const length of [PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]) {
      const errors = await validate(
        plainToInstance(ChangeOwnPasswordDto, {
          currentPassword: 'old-password',
          newPassword: strongPasswordOfLength(length),
        }),
      );

      expect(errors).toHaveLength(0);
    }
  });
});

describe('ResendEmailConfirmationDto email length', () => {
  it('rejects an oversized email', async () => {
    const constraints = await constraintsFor(
      ResendEmailConfirmationDto,
      { email: emailOfLength(EMAIL_MAX_LENGTH + 1) },
      'email',
    );

    expect(constraints).toHaveProperty('maxLength');
  });
});

describe('UpdateOwnProfileDto', () => {
  it('accepts an empty body', async () => {
    const errors = await validate(plainToInstance(UpdateOwnProfileDto, {}));

    expect(errors).toHaveLength(0);
  });

  it('trims a padded email', async () => {
    const dto = plainToInstance(UpdateOwnProfileDto, {
      email: ' Jane@Example.com ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('Jane@Example.com');
  });

  it.each(['name', 'email'])('rejects an explicit null %s', async (field) => {
    const constraints = await constraintsFor(
      UpdateOwnProfileDto,
      { [field]: null },
      field,
    );

    expect(constraints).toBeDefined();
  });

  it('accepts a current password up to the password maximum', async () => {
    const errors = await validate(
      plainToInstance(UpdateOwnProfileDto, {
        currentPassword: 'p'.repeat(PASSWORD_MAX_LENGTH),
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it.each([
    { label: 'an empty', value: '', constraint: 'isNotEmpty' },
    { label: 'a null', value: null, constraint: 'isString' },
    {
      label: 'an oversized',
      value: 'p'.repeat(PASSWORD_MAX_LENGTH + 1),
      constraint: 'maxLength',
    },
  ])(
    'rejects $label current password with $constraint',
    async ({ value, constraint }) => {
      const constraints = await constraintsFor(
        UpdateOwnProfileDto,
        { currentPassword: value },
        'currentPassword',
      );

      expect(constraints).toHaveProperty(constraint);
    },
  );

  // The global ValidationPipe runs with `whitelist: true`, which strips every
  // property without validation metadata before the handler sees the DTO.
  it('carries no validation metadata for protected fields, so the pipe strips them', async () => {
    const errors = await validate(
      plainToInstance(UpdateOwnProfileDto, {
        name: 'Jane Doe',
        roleUuids: 'not-a-uuid-array',
        status: 'NOT_A_STATUS',
        password: 'x',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property).sort()).toEqual([
      'password',
      'roleUuids',
      'status',
    ]);
    expect(errors.map((error) => error.constraints)).toEqual(
      Array(3).fill({ whitelistValidation: expect.any(String) as string }),
    );
  });
});

describe('UpdateUserDto email', () => {
  it('accepts an omitted email', async () => {
    const errors = await validate(plainToInstance(UpdateUserDto, {}));

    expect(errors).toHaveLength(0);
  });

  it('trims a padded email', async () => {
    const dto = plainToInstance(UpdateUserDto, { email: ' Jane@Example.com ' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('Jane@Example.com');
  });

  it('rejects an explicit null email', async () => {
    const constraints = await constraintsFor(
      UpdateUserDto,
      { email: null },
      'email',
    );

    expect(constraints).toHaveProperty('isEmail');
  });
});
