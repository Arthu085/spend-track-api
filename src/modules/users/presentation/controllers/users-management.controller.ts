import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '@core/config';
import { clearAuthCookies } from '@modules/auth/presentation';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { PaginatedResult } from '@shared/application/dto';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { UpdateUserStatusUseCase } from '../../application/use-cases/update-user-status.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { CreateUserDto } from '../dto/input/create-user.dto';
import { ListUsersQueryDto } from '../dto/input/list-users-query.dto';
import { UpdateUserStatusDto } from '../dto/input/update-user-status.dto';
import { UpdateUserDto } from '../dto/input/update-user.dto';
import { UserDetailResponseDto } from '../dto/output/user-detail.response';
import { UserListResponseDto } from '../dto/output/user-list.response';

@Controller('users')
export class UsersManagementController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly updateUserStatus: UpdateUserStatusUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly config: AppConfigService,
  ) {}

  @(endpoint()
    .get()
    .ability({ action: Action.READ, subject: Subject.USER })
    .audit('User.list')
    .successMessage('success.ok')
    .tags('users')
    .summary('List users')
    .paginatedResponse(UserListResponseDto)
    .build())
  async findAll(
    @Query() query: ListUsersQueryDto,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<UserListResponseDto>> {
    const result = await this.listUsers.execute({
      page: query.page,
      limit: query.limit,
      name: query.name,
      email: query.email,
      role: query.role,
      status: query.status,
    });

    return result.map((user) =>
      UserListResponseDto.fromDomain(user, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .ability({ action: Action.READ, subject: Subject.USER })
    .audit('User.read')
    .successMessage('success.ok')
    .tags('users')
    .summary('Get a user by uuid')
    .errorResponse(HttpStatus.NOT_FOUND, 'User not found.')
    .errorResponse(HttpStatus.CONFLICT, 'User is inactive.')
    .response(UserDetailResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Translator() translate: Translate,
  ): Promise<UserDetailResponseDto> {
    const user = await this.getUser.execute(uuid);

    return UserDetailResponseDto.fromDomain(user, translate);
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .ability({ action: Action.CREATE, subject: Subject.USER })
    .audit('User.create')
    .successMessage('success.created')
    .tags('users')
    .summary('Create a new user')
    .description('Granting the ADMIN role requires an active ADMIN actor.')
    .errorResponse(HttpStatus.FORBIDDEN, 'ADMIN grant forbidden.')
    .errorResponse(HttpStatus.NOT_FOUND, 'Role not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Email already in use, or a role is inactive.',
    )
    .body(CreateUserDto)
    .response(UserDetailResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateUserDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<UserDetailResponseDto> {
    const user = await this.createUser.execute({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      roleUuids: dto.roleUuids,
      actorId: actor.id,
    });

    return UserDetailResponseDto.fromDomain(user, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .ability({ action: Action.UPDATE, subject: Subject.USER })
    .ability({ action: Action.READ, subject: Subject.USER })
    .audit('User.update')
    .successMessage('success.updated')
    .tags('users')
    .summary('Update a user')
    .description(
      'Partial update: omitted fields keep their current values. Granting ADMIN requires an active ADMIN actor, and ADMIN can never be removed. Only an active admin can modify an admin; changes to another admin go through POST /users/{uuid}/change-requests. Updating your own profile revokes all of your sessions and clears the auth cookies, so you must log in again; if the email changed, it must be confirmed first.',
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'ADMIN grant forbidden, ADMIN removal forbidden, or only an active admin can modify an admin.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'User or role not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      "Email already in use, user or role inactive, or changes to another admin require that admin's approval.",
    )
    .body(UpdateUserDto)
    .response(UserDetailResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateUserDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDetailResponseDto> {
    const user = await this.updateUser.execute({
      uuid,
      name: dto.name,
      email: dto.email,
      roleUuids: dto.roleUuids,
      actorId: actor.id,
    });

    if (user.id === actor.id) {
      clearAuthCookies(res, this.config.cookie);
    }

    return UserDetailResponseDto.fromDomain(user, translate);
  }

  @(endpoint()
    .put(':uuid/status')
    .ability({ action: Action.UPDATE, subject: Subject.USER })
    .ability({ action: Action.READ, subject: Subject.USER })
    .audit('User.update_status')
    .successMessage('success.updated')
    .tags('users')
    .summary('Activate or deactivate a user')
    .description(
      'Self-deactivation and deactivation of the last active admin are forbidden. Only an active admin can change an admin.',
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Self-deactivation forbidden, or only an active admin can modify an admin.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'User not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Last active admin cannot be deactivated.',
    )
    .body(UpdateUserStatusDto)
    .response(UserDetailResponseDto)
    .build())
  async updateStatus(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<UserDetailResponseDto> {
    const user = await this.updateUserStatus.execute({
      uuid,
      status: dto.status,
      actorId: actor.id,
    });

    return UserDetailResponseDto.fromDomain(user, translate);
  }

  @(endpoint()
    .delete(':uuid')
    .ability({ action: Action.DELETE, subject: Subject.USER })
    .ability({ action: Action.READ, subject: Subject.USER })
    .audit('User.delete')
    .successMessage('success.deleted')
    .tags('users')
    .summary('Soft-delete a user')
    .description(
      'Self-deletion and deletion of the last active admin are forbidden. Only an active admin can delete an admin.',
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Self-deletion forbidden, or only an active admin can modify an admin.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'User not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Last active admin cannot be deleted.')
    .build())
  async remove(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteUser.execute({ uuid, actorId: actor.id });
  }
}
