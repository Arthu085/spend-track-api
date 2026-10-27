import { Body, Controller, HttpStatus, Param } from '@nestjs/common';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { endpoint } from '@shared/presentation/builders';
import { Translator, type Translate } from '@shared/presentation/decorators';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { GetRoleUseCase } from '../../application/use-cases/get-role.use-case';
import { ListRolesUseCase } from '../../application/use-cases/list-roles.use-case';
import { UpdateRoleAbilitiesUseCase } from '../../application/use-cases/update-role-abilities.use-case';
import { UpdateRoleAbilitiesDto } from '../dto/input/update-role-abilities.dto';
import { RoleDetailResponseDto } from '../dto/output/role-detail.response';
import { RoleListResponseDto } from '../dto/output/role-list.response';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly getRole: GetRoleUseCase,
    private readonly updateRoleAbilities: UpdateRoleAbilitiesUseCase,
  ) {}

  @(endpoint()
    .get()
    .ability({ action: Action.READ, subject: Subject.ROLE })
    .audit('Role.list')
    .successMessage('success.ok')
    .tags('roles')
    .summary('List roles')
    .response(RoleListResponseDto, undefined, { isArray: true })
    .build())
  async findAll(
    @Translator() translate: Translate,
  ): Promise<RoleListResponseDto[]> {
    const roles = await this.listRoles.execute();

    return roles.map((role) => RoleListResponseDto.fromDomain(role, translate));
  }

  @(endpoint()
    .get(':uuid')
    .ability({ action: Action.READ, subject: Subject.ROLE })
    .audit('Role.read')
    .successMessage('success.ok')
    .tags('roles')
    .summary('Get a role by uuid')
    .errorResponse(HttpStatus.NOT_FOUND, 'Role not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Role is inactive.')
    .response(RoleDetailResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Translator() translate: Translate,
  ): Promise<RoleDetailResponseDto> {
    const role = await this.getRole.execute(uuid);

    return RoleDetailResponseDto.fromDomain(role, translate);
  }

  @(endpoint()
    .patch(':uuid/abilities')
    .ability({ action: Action.UPDATE, subject: Subject.ROLE })
    .ability({ action: Action.READ, subject: Subject.ROLE })
    .audit('Role.update_abilities')
    .successMessage('success.updated')
    .tags('roles')
    .summary("Replace a role's ability grants")
    .errorResponse(HttpStatus.FORBIDDEN, 'ADMIN role abilities are immutable.')
    .errorResponse(HttpStatus.NOT_FOUND, 'Role not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Role is inactive.')
    .errorResponse(HttpStatus.CONFLICT, 'An ability is inactive.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'An ability pair is not in the catalog.',
    )
    .body(UpdateRoleAbilitiesDto)
    .response(RoleDetailResponseDto)
    .build())
  async updateAbilities(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateRoleAbilitiesDto,
    @Translator() translate: Translate,
  ): Promise<RoleDetailResponseDto> {
    const role = await this.updateRoleAbilities.execute({
      roleUuid: uuid,
      abilities: dto.abilities,
    });

    return RoleDetailResponseDto.fromDomain(role, translate);
  }
}
