import { FindOneUserUseCase } from '../find-one-user.use-case';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { UserEntity } from 'src/modules/user/domain/entities/user.entity';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';
import { DomainRuleViolationException } from 'src/core/domain/exceptions/domain-rule-violation.exception';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { UserFullName } from 'src/modules/user/domain/value-objects/user-full-name.vo';
import { UserEmail } from 'src/modules/user/domain/value-objects/user-email.vo';
import { UserPassword } from 'src/modules/user/domain/value-objects/user-password.vo';
import { TEST_BCRYPT_HASH } from 'src/modules/user/domain/value-objects/test-password-hash';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { FindOneUserResponseDto } from '../../dtos/response/find-one-user.response.dto';

describe('FindOneUserUseCase', () => {
  let useCase: FindOneUserUseCase;
  let userRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    userRepository = {
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    useCase = new FindOneUserUseCase(userRepository);
  });

  const createMockUser = (
    status: StatusEnum = StatusEnum.ACTIVE,
  ): UserEntity => {
    return UserEntity.rehydrate({
      id: 1,
      uuid: Uuid.from('123e4567-e89b-12d3-a456-426614174000'),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      status,
      fullName: UserFullName.create('John Doe'),
      email: UserEmail.create('john@example.com'),
      password: UserPassword.fromHash(TEST_BCRYPT_HASH),
      role: RoleEntity.create({ name: RoleEnum.USER }),
    });
  };

  it('Deve retornar um usuário com sucesso', async () => {
    const user = createMockUser();
    const findByUuidSpy = jest.spyOn(userRepository, 'findByUuid');
    findByUuidSpy.mockResolvedValue(user);

    const result = await useCase.execute(
      '123e4567-e89b-12d3-a456-426614174000',
    );

    expect(findByUuidSpy).toHaveBeenCalledWith(expect.any(Uuid));
    expect(result).toBeInstanceOf(FindOneUserResponseDto);
  });

  it('Deve lançar AppNotFoundException se o usuário não existir', async () => {
    const findByUuidSpy = jest.spyOn(userRepository, 'findByUuid');
    findByUuidSpy.mockResolvedValue(null);

    await expect(
      useCase.execute('123e4567-e89b-12d3-a456-426614174000'),
    ).rejects.toThrow(AppNotFoundException);

    expect(findByUuidSpy).toHaveBeenCalledWith(expect.any(Uuid));
  });

  it('Deve lançar erro se o usuário estiver inativo', async () => {
    const user = createMockUser(StatusEnum.INACTIVE);
    const findByUuidSpy = jest.spyOn(userRepository, 'findByUuid');
    findByUuidSpy.mockResolvedValue(user);

    await expect(
      useCase.execute('123e4567-e89b-12d3-a456-426614174000'),
    ).rejects.toThrow(DomainRuleViolationException);
  });
});
