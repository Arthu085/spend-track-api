import { Body, Controller, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { CheckPermissions } from 'src/modules/access-control/presentation/decorators/check-permission.decorator';
import { ActionEnum } from 'src/core/domain/enums/action.enum';
import { SubjectEnum } from 'src/core/domain/enums/subject.enum';
import { CreateUserRequestDto } from '../../application/dtos/request/create-user.request.dto';
import { UpdateUserRequestDto } from '../../application/dtos/request/update-user.request.dto';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';

@Controller('users')
@ApiTags('User')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
  ) {}

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
    url: '/:uuid',
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
    @Query('uuid') uuid: string,
    @Body() dto: UpdateUserRequestDto,
  ): Promise<void> {
    await this.updateUserUseCase.execute(uuid, dto);
  }
}
