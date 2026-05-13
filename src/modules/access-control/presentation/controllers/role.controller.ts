import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { UpdateRoleAbilitiesUseCase } from '../../application/use-cases/update-role-abilities.use-case';
import { CheckPermissions } from '../decorators/check-permission.decorator';
import { ActionEnum } from '../../../../core/domain/enums/action.enum';
import { SubjectEnum } from '../../../../core/domain/enums/subject.enum';
import { Body, Controller, Param, Query } from '@nestjs/common';
import { UpdateRoleAbilitiesRequestDto } from '../../application/dtos/request/update-role-abilities.request.dto';
import { ApiTags } from '@nestjs/swagger';
import { FindAllRoleResponseDto } from '../../application/dtos/response/find-all-role.response.dto';
import { PaginatedResponse } from 'src/shared/interfaces/paginated-response.interface';
import { FindAllRoleUseCase } from '../../application/use-cases/find-all-role.use-case';
import { FindAllRoleRequestDto } from '../../application/dtos/request/find-all-role.request.dto';
import { FindOneRoleResponseDto } from '../../application/dtos/response/find-one-role.response.dto';
import { FindOneRoleUseCase } from '../../application/use-cases/find-one-role.use-case';
import { UuidValidationPipe } from 'src/shared/utils/pipes/uuid-validation.pipe';

@Controller('roles')
@ApiTags('Role')
export class RoleController {
  constructor(
    private readonly findAllRoleUseCase: FindAllRoleUseCase,
    private readonly findOneRoleUseCase: FindOneRoleUseCase,
    private readonly updateRoleAbilitiesUseCase: UpdateRoleAbilitiesUseCase,
  ) {}

  @Endpoint.get({
    url: '',
    description: 'Listar funções',
    dtoName: 'FindAllRoleRequestDto',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Lista de funções retornada com sucesso',
        responseType: FindAllRoleResponseDto,
      },
    ],
    responseMessage: 'Lista de funções retornada com sucesso',
  })
  @CheckPermissions([{ action: ActionEnum.READ, subject: SubjectEnum.ROLE }])
  async findAll(
    @Query() query: FindAllRoleRequestDto,
  ): Promise<PaginatedResponse<FindAllRoleResponseDto>> {
    return this.findAllRoleUseCase.execute(query);
  }

  @Endpoint.get({
    url: ':uuid',
    description: 'Obter detalhes de uma função',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Detalhes da função retornados com sucesso',
        responseType: FindOneRoleResponseDto,
      },
    ],
    responseMessage: 'Detalhes da função retornados com sucesso',
  })
  @CheckPermissions([{ action: ActionEnum.READ, subject: SubjectEnum.ROLE }])
  async findOne(
    @Param('uuid', UuidValidationPipe) uuid: string,
  ): Promise<FindOneRoleResponseDto> {
    return this.findOneRoleUseCase.execute(uuid);
  }

  @Endpoint.put({
    url: ':uuid/abilities',
    description: 'Atualizar permissões da função',
    dtoName: 'UpdateRoleAbilitiesRequestDto',
    authType: 'access',
    requirePermission: true,
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
    @Param('uuid', UuidValidationPipe) uuid: string,
    @Body() dto: UpdateRoleAbilitiesRequestDto,
  ): Promise<void> {
    await this.updateRoleAbilitiesUseCase.execute(uuid, dto);
  }
}
