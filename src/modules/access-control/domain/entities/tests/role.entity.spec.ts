import { AppConflictException } from 'src/core/exceptions/app-conflict.exception';
import { RoleEnum } from '../../enums/role.enum';
import { RoleEntity } from '../role.entity';

describe('RoleEntity', () => {
  it('Deve criar uma função com nome válido', () => {
    const role = RoleEntity.create({ name: RoleEnum.USER });
    expect(role.name).toBe(RoleEnum.USER);
  });

  it('Deve lançar erro ao validar role ADMIN', () => {
    const role = RoleEntity.create({
      name: RoleEnum.ADMIN,
    });

    expect(() => role.ensureIsNotAdmin()).toThrow(AppConflictException);
  });

  it('Não deve lançar erro para role comum', () => {
    const role = RoleEntity.create({
      name: RoleEnum.USER,
    });

    expect(() => role.ensureIsNotAdmin()).not.toThrow();
  });
});
