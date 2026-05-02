import { Body, Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { CheckPermissions } from 'src/modules/access-control/presentation/decorators/check-permission.decorator';
import { ActionEnum } from 'src/modules/access-control/domain/enums/action.enum';
import { SubjectEnum } from 'src/modules/access-control/domain/enums/subject.enum';
import { CreateUserRequestDto } from '../../application/dtos/request/create-user.request.dto';

@Controller('users')
@ApiTags('User')
export class UserController {
  constructor(private readonly createUserUseCase: CreateUserUseCase) {}

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
}
