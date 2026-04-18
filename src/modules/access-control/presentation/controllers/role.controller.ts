import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { UpdateRoleAbilitiesUseCase } from '../../application/use-cases/update-role-abilities.use-case';
import { CheckPermissions } from '../decorators/check-permission.decorator';
import { ActionEnum } from '../../domain/enums/action.enum';
import { SubjectEnum } from '../../domain/enums/subject.enum';
import { Body, Controller, Param, Query } from '@nestjs/common';
import { UpdateRoleAbilitiesRequestDto } from '../../application/dtos/request/update-role-abilities.request.dto';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { FindAllRoleResponseDto } from '../../application/dtos/response/find-all-role.respose.dto';
import { PaginatedResponse } from 'src/shared/interfaces/paginated-response.interface';
import { FindAllRoleUseCase } from '../../application/use-cases/find-all-role.use-case';
import { FindAllRoleRequestDto } from '../../application/dtos/request/find-all-role.request.dto';

@Controller('roles')
@ApiTags('Role')
@ApiCookieAuth('token')
export class RoleController {
  constructor(
    private readonly findAllRolesUseCase: FindAllRoleUseCase,
    private readonly updateRoleAbilitiesUseCase: UpdateRoleAbilitiesUseCase,
  ) {}

  @Endpoint.get({
    url: '',
    description: 'Listar funções',
    dtoName: 'PaginationDto',
    isProtected: true,
    responses: [
      {
        status: 200,
        description: 'Lista de funções retornada com sucesso',
        responseType: FindAllRoleResponseDto,
      },
    ],
    responseMessage: 'Lista de funções retornada com sucesso',
  })
  // @CheckPermissions([{ action: ActionEnum.READ, subject: SubjectEnum.ROLE }])
  async findAll(
    @Query() query: FindAllRoleRequestDto,
  ): Promise<PaginatedResponse<FindAllRoleResponseDto>> {
    return this.findAllRolesUseCase.execute(query);
  }

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
    responseMessage: 'Permissões atualizadas com sucesso',
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
