import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { InvestmentMovementResponseDto } from '@modules/investments/presentation';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { AcceptAdditionalContributionUseCase } from '../../application/use-cases/accept-additional-contribution.use-case';
import { ListSavingPlansUseCase } from '../../application/use-cases/list-saving-plans.use-case';
import { AcceptAdditionalContributionDto } from '../dto/input/accept-additional-contribution.dto';
import { SavingPlansQueryDto } from '../dto/input/saving-plans-query.dto';
import { SavingPlanResponseDto } from '../dto/output/saving-plan.response';

@Controller('recurrences')
export class RecurrenceSavingPlansController {
  constructor(
    private readonly listSavingPlans: ListSavingPlansUseCase,
    private readonly acceptAdditionalContribution: AcceptAdditionalContributionUseCase,
  ) {}

  @(endpoint()
    .get('saving-plans')
    .successMessage('success.ok')
    .tags('recurrences')
    .summary('Compute the saving plans of a month')
    .description(
      "One item per ACTIVE investment contribution recurrence with a saving strategy, active investment, and active account, by description, for a month from the month of startDate through the month of endDate. Suggestions on a shared account overlap until one is accepted, so do not add them together. Everything is derived on read and nothing is stored. Card obligations are the dashboard's creditCards.outstanding + creditCards.plannedDue; cards are not linked to accounts, so all of it is charged against this account, a conservative estimate. Suggestions never change a balance. Scoped to the authenticated user.",
    )
    .response(SavingPlanResponseDto, undefined, { isArray: true })
    .build())
  async findAll(
    @Query() query: SavingPlansQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<SavingPlanResponseDto[]> {
    const plans = await this.listSavingPlans.execute({
      ownerId: actor.id,
      year: query.year,
      month: query.month,
    });

    return plans.map((plan) =>
      SavingPlanResponseDto.fromDomain(plan, translate),
    );
  }

  @(endpoint()
    .post(':uuid/additional-contributions')
    .httpCode(HttpStatus.CREATED)
    .audit('Recurrence.acceptAdditionalContribution')
    .successMessage('success.created')
    .tags('recurrences')
    .summary('Accept an additional contribution for a month')
    .description(
      "Records one contribution from the recurrence's account to its investment, with the suggested amount and retained minimum of that moment as an immutable snapshot. amount may differ from the suggestion. It is a normal investment movement: cancel it through PUT /investments/:uuid/movements/:movementUuid/state, which frees the month. Scoped to the authenticated user: another user's recurrence answers 404.",
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Recurrence not ACTIVE or without REMAINING_SURPLUS, month before the month of startDate or after the month of endDate, investment or account inactive or deleted, or the month already has a live additional contribution.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Month before the current one, date outside the month, COMPLETED with a date after today, or date before the opening balance date of the account.',
    )
    .body(AcceptAdditionalContributionDto)
    .response(InvestmentMovementResponseDto, HttpStatus.CREATED)
    .build())
  async accept(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: AcceptAdditionalContributionDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentMovementResponseDto> {
    const movement = await this.acceptAdditionalContribution.execute({
      uuid,
      ownerId: actor.id,
      year: dto.year,
      month: dto.month,
      amount: parseMoney(dto.amount),
      date: dto.date ?? undefined,
      state: dto.state,
    });

    return InvestmentMovementResponseDto.fromDomain(movement, translate);
  }
}
