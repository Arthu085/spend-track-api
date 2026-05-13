import { UpdateUserUseCase } from '../update-user.use-case';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { UserApplicationService } from '../../services/user-application.service';
import { UpdateUserRequestDto } from '../../dtos/request/update-user.request.dto';
import { UserEntity } from 'src/modules/user/domain/entities/user.entity';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { UserFullName } from 'src/modules/user/domain/value-objects/user-full-name.vo';
import { UserEmail } from 'src/modules/user/domain/value-objects/user-email.vo';
import { UserPassword } from 'src/modules/user/domain/value-objects/user-password.vo';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';

describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let userAppService: jest.Mocked<UserApplicationService>;

  beforeEach(() => {
    userRepository = {
      findAll: jest.fn(),
      findByUuid: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    userAppService = {
      findActiveUser: jest.fn(),
      ensureEmailAvailable: jest.fn(),
      resolveRole: jest.fn(),
    } as unknown as jest.Mocked<UserApplicationService>;

    useCase = new UpdateUserUseCase(userRepository, userAppService);
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
      password: UserPassword.fromHash('hashed-password'),
      role: RoleEntity.create({ name: RoleEnum.USER }),
    });
  };

  it('Deve atualizar os dados do usuário com sucesso', async () => {
    const user = createMockUser();
    const mockRole = RoleEntity.create({ name: RoleEnum.ADMIN });
    Object.defineProperty(mockRole, 'id', { value: 2 });

    const findActiveUserSpy = jest.spyOn(userAppService, 'findActiveUser');
    const ensureEmailAvailableSpy = jest.spyOn(
      userAppService,
      'ensureEmailAvailable',
    );
    const resolveRoleSpy = jest.spyOn(userAppService, 'resolveRole');
    const saveSpy = jest.spyOn(userRepository, 'save');

    findActiveUserSpy.mockResolvedValue(user);
    ensureEmailAvailableSpy.mockResolvedValue(undefined);
    resolveRoleSpy.mockResolvedValue(mockRole);
    saveSpy.mockResolvedValue(undefined);

    const dto: UpdateUserRequestDto = {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'NewStrongPassword123!',
      roleUuid: 'role-uuid-456',
    };

    await useCase.execute('123e4567-e89b-12d3-a456-426614174000', dto);

    expect(findActiveUserSpy).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(ensureEmailAvailableSpy).toHaveBeenCalled();
    expect(resolveRoleSpy).toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalledWith(expect.any(UserEntity), {
      roleId: 2,
    });
    expect(user.fullName.getValue()).toBe('Jane Doe');
    expect(user.email.getValue()).toBe('jane@example.com');
  });

  it('Deve atualizar apenas os campos informados', async () => {
    const user = createMockUser();

    const findActiveUserSpy = jest.spyOn(userAppService, 'findActiveUser');
    const ensureEmailAvailableSpy = jest.spyOn(
      userAppService,
      'ensureEmailAvailable',
    );
    const resolveRoleSpy = jest.spyOn(userAppService, 'resolveRole');
    const saveSpy = jest.spyOn(userRepository, 'save');

    // Retorna a role atual do usuário para simular que não houve mudança
    findActiveUserSpy.mockResolvedValue(user);
    resolveRoleSpy.mockResolvedValue(user.role);
    saveSpy.mockResolvedValue(undefined);

    const dto: UpdateUserRequestDto = {
      fullName: 'Jane Doe',
    };

    await useCase.execute('123e4567-e89b-12d3-a456-426614174000', dto);

    expect(findActiveUserSpy).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(ensureEmailAvailableSpy).not.toHaveBeenCalled();
    expect(resolveRoleSpy).toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalled();

    expect(user.fullName.getValue()).toBe('Jane Doe');
    expect(user.email.getValue()).toBe('john@example.com'); // Email permaneceu o mesmo
  });
});
