import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEmail } from '../../value-objects/user-email.vo';
import { UserFullName } from '../../value-objects/user-full-name.vo';
import { UserPassword } from '../../value-objects/user-password.vo';
import { UserEntity } from '../user.entity';

describe('UserEntity', () => {
  let roleAdmin: RoleEntity;
  let roleUser: RoleEntity;

  beforeAll(() => {
    roleAdmin = RoleEntity.create({ name: RoleEnum.ADMIN });
    roleUser = RoleEntity.create({ name: RoleEnum.USER });
  });

  describe('create', () => {
    it('Deve criar um usuário com dados válidos', async () => {
      const fullName = UserFullName.create('John Doe');
      const email = UserEmail.create('john@test.com');
      const password = await UserPassword.create('StrongPass123!');

      const user = UserEntity.create({
        fullName,
        email,
        password,
        role: roleUser,
      });

      expect(user.id).toBe(0);
      expect(user.uuid).toBeDefined();
      expect(user.status).toBe(StatusEnum.ACTIVE);
      expect(user.fullName.getValue()).toBe('John Doe');
      expect(user.email.getValue()).toBe('john@test.com');
      expect(user.role.name).toBe(RoleEnum.USER);
    });
  });

  describe('rehydrate', () => {
    it('Deve reidratar a entidade corretamente', async () => {
      const uuid = Uuid.create();
      const date = new Date();
      const fullName = UserFullName.create('Alice Smith');
      const email = UserEmail.create('alice@test.com');
      const password = await UserPassword.create('StrongPass123!');

      const user = UserEntity.rehydrate({
        id: 1,
        uuid,
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
        status: StatusEnum.INACTIVE,
        fullName,
        email,
        password,
        role: roleAdmin,
      });

      expect(user.id).toBe(1);
      expect(user.uuid.toString()).toBe(uuid.toString());
      expect(user.status).toBe(StatusEnum.INACTIVE);
      expect(user.createdAt).toBe(date);
    });
  });

  describe('update', () => {
    it('Deve atualizar os campos corretamente e alterar updatedAt', async () => {
      const user = UserEntity.create({
        fullName: UserFullName.create('Old Name'),
        email: UserEmail.create('old@test.com'),
        password: await UserPassword.create('OldPass123!'),
        role: roleUser,
      });

      const previousUpdatedAt = user.updatedAt;

      await new Promise((r) => setTimeout(r, 10));

      const newFullName = UserFullName.create('New Name');
      const newEmail = UserEmail.create('new@test.com');
      const newPassword = await UserPassword.create('NewPass123!');

      user.update({
        fullName: newFullName,
        email: newEmail,
        password: newPassword,
        role: roleAdmin,
      });

      expect(user.fullName.getValue()).toBe('New Name');
      expect(user.email.getValue()).toBe('new@test.com');
      expect(user.role.name).toBe(RoleEnum.ADMIN);
      expect(user.updatedAt.getTime()).toBeGreaterThan(
        previousUpdatedAt.getTime(),
      );
    });

    it('Não deve alterar updatedAt se nada for atualizado', async () => {
      const user = UserEntity.create({
        fullName: UserFullName.create('Test Name'),
        email: UserEmail.create('test@test.com'),
        password: await UserPassword.create('TestPass123!'),
        role: roleUser,
      });

      const previousUpdatedAt = user.updatedAt;

      await new Promise((r) => setTimeout(r, 10));

      user.update({});

      expect(user.updatedAt.getTime()).toBe(previousUpdatedAt.getTime());
    });
  });

  describe('comparePassword', () => {
    it('Deve retornar true se a senha correta for fornecida', async () => {
      const password = await UserPassword.create('RightPass123!');
      const user = UserEntity.create({
        fullName: UserFullName.create('John Doe'),
        email: UserEmail.create('john@test.com'),
        password,
        role: roleUser,
      });

      const isMatch = await user.comparePassword('RightPass123!');
      expect(isMatch).toBe(true);
    });

    it('Deve retornar false se a senha errada for fornecida', async () => {
      const password = await UserPassword.create('RightPass123!');
      const user = UserEntity.create({
        fullName: UserFullName.create('John Doe'),
        email: UserEmail.create('john@test.com'),
        password,
        role: roleUser,
      });

      const isMatch = await user.comparePassword('WrongPass123!');
      expect(isMatch).toBe(false);
    });
  });
});
