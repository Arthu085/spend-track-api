import { Body, Controller, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { CheckPermissions } from 'src/modules/access-control/presentation/decorators/check-permission.decorator';
import { ActionEnum } from 'src/core/domain/enums/action.enum';
import { SubjectEnum } from 'src/core/domain/enums/subject.enum';
import { CreateUserRequestDto } from '../../application/dtos/request/create-user.request.dto';
import { UpdateUserRequestDto } from '../../application/dtos/request/update-user.request.dto';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { FindAllUserResponseDto } from '../../application/dtos/response/find-all-user.response.dto';
import { FindAllUserRequestDto } from '../../application/dtos/request/find-all-user.request.dto';
import { PaginatedResponse } from 'src/shared/interfaces/paginated-response.interface';
import { FindAllUserUseCase } from '../../application/use-cases/find-all-user.use-case';
import { FindOneUserResponseDto } from '../../application/dtos/response/find-one-user.response.dto';
import { FindOneUserUseCase } from '../../application/use-cases/find-one-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';
import { ActivateUserUseCase } from '../../application/use-cases/activate-user.use-case';
import { DeactivateUserUseCase } from '../../application/use-cases/deactivate-user.use-case';
import { UuidValidationPipe } from 'src/shared/utils/pipes/uuid-validation.pipe';

@Controller('users')
@ApiTags('User')
export class UserController {
  constructor(
    private readonly findAllUserUseCase: FindAllUserUseCase,
    private readonly findOneUserUseCase: FindOneUserUseCase,
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly activateUserUseCase: ActivateUserUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
  ) {}

  @Endpoint.get({
    url: '',
    description: 'Listar usuários',
    dtoName: 'FindAllUserRequestDto',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Lista de usuários retornada com sucesso',
        responseType: FindAllUserResponseDto,
      },
    ],
    responseMessage: 'Lista de usuários retornada com sucesso',
  })
  @CheckPermissions([{ action: ActionEnum.READ, subject: SubjectEnum.USER }])
  async findAll(
    @Query() query: FindAllUserRequestDto,
  ): Promise<PaginatedResponse<FindAllUserResponseDto>> {
    return this.findAllUserUseCase.execute(query);
  }

  @Endpoint.get({
    url: ':uuid',
    description: 'Obter detalhes de um usuário',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Detalhes do usuário retornados com sucesso',
        responseType: FindOneUserResponseDto,
      },
    ],
    responseMessage: 'Detalhes do usuário retornados com sucesso',
  })
  @CheckPermissions([{ action: ActionEnum.READ, subject: SubjectEnum.USER }])
  async findOne(
    @Param('uuid', UuidValidationPipe) uuid: string,
  ): Promise<FindOneUserResponseDto> {
    return this.findOneUserUseCase.execute(uuid);
  }

  @Endpoint.post({
    url: '',
    description: 'Criar um novo usuário',
    dtoName: 'CreateUserRequestDto',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 201,
        description: 'Usuário criado com sucesso',
      },
    ],
    responseMessage: 'Usuário criado com sucesso',
  })
  @CheckPermissions([
    { action: ActionEnum.READ, subject: SubjectEnum.USER },
    { action: ActionEnum.CREATE, subject: SubjectEnum.USER },
  ])
  async create(@Body() dto: CreateUserRequestDto): Promise<void> {
    await this.createUserUseCase.execute(dto);
  }

  @Endpoint.patch({
    url: ':uuid',
    description: 'Atualizar um usuário existente',
    dtoName: 'UpdateUserRequestDto',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Usuário atualizado com sucesso',
      },
      {
        status: 404,
        description: 'Usuário não encontrado',
      },
    ],
    responseMessage: 'Usuário atualizado com sucesso',
  })
  @CheckPermissions([
    { action: ActionEnum.READ, subject: SubjectEnum.USER },
    { action: ActionEnum.UPDATE, subject: SubjectEnum.USER },
  ])
  async update(
    @Param('uuid', UuidValidationPipe) uuid: string,
    @Body() dto: UpdateUserRequestDto,
  ): Promise<void> {
    await this.updateUserUseCase.execute(uuid, dto);
  }

  @Endpoint.delete({
    url: ':uuid',
    description: 'Excluir um usuário',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Usuário excluído com sucesso',
      },
      {
        status: 404,
        description: 'Usuário não encontrado',
      },
    ],
    responseMessage: 'Usuário excluído com sucesso',
  })
  @CheckPermissions([
    { action: ActionEnum.READ, subject: SubjectEnum.USER },
    { action: ActionEnum.DELETE, subject: SubjectEnum.USER },
  ])
  async delete(@Param('uuid', UuidValidationPipe) uuid: string): Promise<void> {
    await this.deleteUserUseCase.execute(uuid);
  }

  @Endpoint.patch({
    url: ':uuid/activate',
    description: 'Ativar usuário',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Usuário ativado com sucesso',
      },
      {
        status: 404,
        description: 'Usuário não encontrado',
      },
    ],
    responseMessage: 'Usuário ativado com sucesso',
  })
  @CheckPermissions([{ action: ActionEnum.UPDATE, subject: SubjectEnum.USER }])
  async activate(
    @Param('uuid', UuidValidationPipe) uuid: string,
  ): Promise<void> {
    await this.activateUserUseCase.execute(uuid);
  }

  @Endpoint.patch({
    url: ':uuid/deactivate',
    description: 'Desativar usuário',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Usuário desativado com sucesso',
      },
      {
        status: 404,
        description: 'Usuário não encontrado',
      },
    ],
    responseMessage: 'Usuário desativado com sucesso',
  })
  @CheckPermissions([{ action: ActionEnum.UPDATE, subject: SubjectEnum.USER }])
  async deactivate(
    @Param('uuid', UuidValidationPipe) uuid: string,
  ): Promise<void> {
    await this.deactivateUserUseCase.execute(uuid);
  }
}
