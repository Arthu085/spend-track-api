import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { UpdateRoleAbilitiesUseCase } from '../../application/use-cases/update-role-abilities.use-case';
import { CheckPermissions } from '../decorators/check-permission.decorator';
import { ActionEnum } from '../../domain/enums/action.enum';
import { SubjectEnum } from '../../domain/enums/subject.enum';
import { Body, Controller, Param } from '@nestjs/common';
import { UpdateRoleAbilitiesRequestDto } from '../../application/dtos/request/update-role-abilities.request.dto';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

@Controller('roles')
@ApiTags('Role')
@ApiCookieAuth('token')
export class RoleController {
  constructor(
    private readonly updateRoleAbilitiesUseCase: UpdateRoleAbilitiesUseCase,
  ) {}

  @Endpoint.put({
    url: ':uuid/abilities',
    description: 'Atualizar permissões da função',
    dtoName: 'UpdateRoleAbilitiesRequestDto',
    isProtected: true,
    responses: [
      {
        status: 200,
        description: 'Permissões atualizadas com sucesso',
      },
    ],
  })
  @CheckPermissions([
    { action: ActionEnum.READ, subject: SubjectEnum.ROLE },
    { action: ActionEnum.UPDATE, subject: SubjectEnum.ROLE },
  ])
  async updateAbilities(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateRoleAbilitiesRequestDto,
  ): Promise<void> {
    await this.updateRoleAbilitiesUseCase.execute(uuid, dto);
  }
}
