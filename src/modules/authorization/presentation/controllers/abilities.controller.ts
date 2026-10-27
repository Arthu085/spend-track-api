import { Controller } from '@nestjs/common';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { endpoint } from '@shared/presentation/builders';
import { Translator, type Translate } from '@shared/presentation/decorators';
import { ListAbilitiesUseCase } from '../../application/use-cases/list-abilities.use-case';
import { AbilityResponseDto } from '../dto/output/ability.response';

@Controller('abilities')
export class AbilitiesController {
  constructor(private readonly listAbilities: ListAbilitiesUseCase) {}

  @(endpoint()
    .get()
    .ability({ action: Action.READ, subject: Subject.ABILITY })
    .audit('Ability.list')
    .successMessage('success.ok')
    .tags('abilities')
    .summary('List the fixed ability catalog')
    .response(AbilityResponseDto, undefined, { isArray: true })
    .build())
  async findAll(
    @Translator() translate: Translate,
  ): Promise<AbilityResponseDto[]> {
    const abilities = await this.listAbilities.execute();

    return abilities.map((ability) =>
      AbilityResponseDto.fromDomain(ability, translate),
    );
  }
}
