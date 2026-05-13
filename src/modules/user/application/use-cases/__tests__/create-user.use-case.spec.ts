import { CreateUserUseCase } from '../create-user.use-case';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { UserApplicationService } from '../../services/user-application.service';
import { CreateUserRequestDto } from '../../dtos/request/create-user.request.dto';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { UserEntity } from 'src/modules/user/domain/entities/user.entity';

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
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

    useCase = new CreateUserUseCase(userRepository, userAppService);
  });

  it('Deve criar um usuário com sucesso', async () => {
    const dto: CreateUserRequestDto = {
      fullName: 'John Doe',
      email: 'john@example.com',
      password: 'StrongPassword123!',
      roleUuid: 'role-uuid-123',
    };

    const mockRole = RoleEntity.create({ name: RoleEnum.USER });
    Object.defineProperty(mockRole, 'id', { value: 1 });

    const ensureEmailAvailableSpy = jest.spyOn(
      userAppService,
      'ensureEmailAvailable',
    );
    const resolveRoleSpy = jest.spyOn(userAppService, 'resolveRole');
    const saveSpy = jest.spyOn(userRepository, 'save');

    ensureEmailAvailableSpy.mockResolvedValue(undefined);
    resolveRoleSpy.mockResolvedValue(mockRole);
    saveSpy.mockResolvedValue(undefined);

    await useCase.execute(dto);

    expect(ensureEmailAvailableSpy).toHaveBeenCalled();
    expect(resolveRoleSpy).toHaveBeenCalledWith(dto.roleUuid);
    expect(saveSpy).toHaveBeenCalledWith(expect.any(UserEntity), {
      roleId: 1,
    });
  });
});
