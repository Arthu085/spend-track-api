import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from '@modules/auth/presentation/dto/input/login.dto';
import { UpdateRoleAbilitiesDto } from '@modules/authorization/presentation/dto/input/update-role-abilities.dto';
import { PaginationQueryDto } from '@shared/presentation/dto/pagination-query.dto';
import { normalizeValidationErrors } from '../normalize-validation-errors';

const normalize = <T extends object>(
  dto: new () => T,
  plain: Record<string, unknown>,
) =>
  normalizeValidationErrors(validateSync(plainToInstance(dto, plain))).map(
    ({ property, children, constraints }) => ({
      property,
      children,
      constraintKeys: Object.keys(constraints ?? {}),
    }),
  );

describe('normalizeValidationErrors', () => {
  it('reports a missing field as required instead of every failing constraint', () => {
    expect(normalize(LoginDto, { email: 'admin@email.com' })).toEqual([
      { property: 'password', children: [], constraintKeys: ['isDefined'] },
    ]);
  });

  it('reports a null field as required', () => {
    expect(normalize(UpdateRoleAbilitiesDto, { abilities: null })).toEqual([
      { property: 'abilities', children: [], constraintKeys: ['isDefined'] },
    ]);
  });

  it('keeps only the type constraint when the value has the wrong type', () => {
    expect(normalize(PaginationQueryDto, { limit: 'abc' })).toEqual([
      { property: 'limit', children: [], constraintKeys: ['isInt'] },
    ]);
  });

  it('keeps every constraint when the value has the right type', () => {
    expect(
      normalize(LoginDto, {
        email: 'a'.repeat(300),
        password: 'secret',
      }),
    ).toEqual([
      {
        property: 'email',
        children: [],
        constraintKeys: ['isEmail', 'maxLength'],
      },
    ]);
  });

  it('flattens nested errors into the full property path', () => {
    expect(
      normalize(UpdateRoleAbilitiesDto, {
        abilities: [{ action: 'READ', subject: 'NotARealSubject' }],
      }),
    ).toEqual([
      {
        property: 'abilities.0.subject',
        children: [],
        constraintKeys: ['isEnum'],
      },
    ]);
  });

  it('keeps the parent constraint alongside nested errors', () => {
    const duplicated = { action: 'NotAnAction', subject: 'USER' };

    expect(
      normalize(UpdateRoleAbilitiesDto, {
        abilities: [duplicated, duplicated],
      }),
    ).toEqual([
      {
        property: 'abilities',
        children: [],
        constraintKeys: ['arrayUnique'],
      },
      {
        property: 'abilities.0.action',
        children: [],
        constraintKeys: ['isEnum'],
      },
      {
        property: 'abilities.1.action',
        children: [],
        constraintKeys: ['isEnum'],
      },
    ]);
  });
});
