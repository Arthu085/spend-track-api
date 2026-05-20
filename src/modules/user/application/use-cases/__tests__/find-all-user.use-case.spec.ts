import { FindAllUserUseCase } from '../find-all-user.use-case';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { UserEntity } from 'src/modules/user/domain/entities/user.entity';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { UserFullName } from 'src/modules/user/domain/value-objects/user-full-name.vo';
import { UserEmail } from 'src/modules/user/domain/value-objects/user-email.vo';
import { UserPassword } from 'src/modules/user/domain/value-objects/user-password.vo';
import { TEST_BCRYPT_HASH } from 'src/modules/user/domain/value-objects/test-password-hash';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { FindAllUserRequestDto } from '../../dtos/request/find-all-user.request.dto';
import { FindAllUserResponseDto } from '../../dtos/response/find-all-user.response.dto';

describe('FindAllUserUseCase', () => {
  let useCase: FindAllUserUseCase;
  let userRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    userRepository = {
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    useCase = new FindAllUserUseCase(userRepository);
  });

  const createMockUser = (): UserEntity => {
    return UserEntity.rehydrate({
      id: 1,
      uuid: Uuid.from('123e4567-e89b-12d3-a456-426614174000'),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      status: StatusEnum.ACTIVE,
      fullName: UserFullName.create('John Doe'),
      email: UserEmail.create('john@example.com'),
      password: UserPassword.fromHash(TEST_BCRYPT_HASH),
      role: RoleEntity.create({ name: RoleEnum.USER }),
    });
  };

  it('Deve retornar uma lista paginada de usuários', async () => {
    const user = createMockUser();

    const findAllSpy = jest.spyOn(userRepository, 'findAll');
    findAllSpy.mockResolvedValue([[user], 1]);

    const query: FindAllUserRequestDto = { page: 1, limit: 10 };
    const result = await useCase.execute(query);

    expect(findAllSpy).toHaveBeenCalledWith(query);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toBeInstanceOf(FindAllUserResponseDto);
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('Deve retornar lista vazia se não houver usuários', async () => {
    const findAllSpy = jest.spyOn(userRepository, 'findAll');
    findAllSpy.mockResolvedValue([[], 0]);

    const query: FindAllUserRequestDto = { page: 1, limit: 10 };
    const result = await useCase.execute(query);

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });
});
