import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FindAllAbilityUseCase } from '../../application/use-cases/find-all-ability.use-case';
import { Endpoint } from 'src/core/api/builders/endpoint.builder';
import { FindAllAbilityResponseDto } from '../../application/dtos/response/find-all-ability.response.dto';
import { CheckPermissions } from '../decorators/check-permission.decorator';
import { ActionEnum } from '../../../../core/domain/enums/action.enum';
import { SubjectEnum } from '../../../../core/domain/enums/subject.enum';

@Controller('abilities')
@ApiTags('Ability')
export class AbilityController {
  constructor(private readonly findAllAbilityUseCase: FindAllAbilityUseCase) {}

  @Endpoint.get({
    url: '',
    description: 'Listar todas permissões do sistema',
    authType: 'access',
    requirePermission: true,
    responses: [
      {
        status: 200,
        description: 'Permissões retornadas com sucesso',
        responseType: FindAllAbilityResponseDto,
      },
    ],
  })
  @CheckPermissions([{ action: ActionEnum.READ, subject: SubjectEnum.ROLE }])
  async findAll(): Promise<FindAllAbilityResponseDto[]> {
    return this.findAllAbilityUseCase.execute();
  }
}
