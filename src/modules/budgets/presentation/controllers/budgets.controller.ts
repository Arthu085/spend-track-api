import { Body, Controller, HttpStatus, Param } from '@nestjs/common';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { DeleteBudgetUseCase } from '../../application/use-cases/delete-budget.use-case';
import { GetBudgetUseCase } from '../../application/use-cases/get-budget.use-case';
import { SaveBudgetUseCase } from '../../application/use-cases/save-budget.use-case';
import { BudgetMonthParamsDto } from '../dto/input/budget-month-params.dto';
import { SaveBudgetDto } from '../dto/input/save-budget.dto';
import { BudgetResponseDto } from '../dto/output/budget.response';

const OWNERSHIP_NOTE =
  "Available to every authenticated user, without any ability, and always scoped to the caller's own budget.";

@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly getBudget: GetBudgetUseCase,
    private readonly saveBudget: SaveBudgetUseCase,
    private readonly deleteBudget: DeleteBudgetUseCase,
  ) {}

  @(endpoint()
    .get(':year/:month')
    .successMessage('success.ok')
    .tags('budgets')
    .summary('Get your budget for a month')
    .description(
      `Returns the overall and category limits saved for the month. A month without a budget answers with a null totalLimit, no category limits, and a null updatedAt. Spending against the limits is in GET /dashboard. ${OWNERSHIP_NOTE}`,
    )
    .response(BudgetResponseDto)
    .build())
  async findMine(
    @Param() params: BudgetMonthParamsDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<BudgetResponseDto> {
    const budget = await this.getBudget.execute({
      ownerId: actor.id,
      year: params.year,
      month: params.month,
    });

    return BudgetResponseDto.fromDomain(budget, translate);
  }

  @(endpoint()
    .put(':year/:month')
    .audit('Budget.update')
    .successMessage('success.updated')
    .tags('budgets')
    .summary('Create or replace your budget for a month')
    .description(
      `Replaces the overall limit and every category limit of the month; other months never change. Budgets never block transactions: spending above a limit only changes the dashboard indicators. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Transaction category is inactive.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'No limit set, or a category is not an expense category.',
    )
    .body(SaveBudgetDto)
    .response(BudgetResponseDto)
    .build())
  async saveMine(
    @Param() params: BudgetMonthParamsDto,
    @Body() dto: SaveBudgetDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<BudgetResponseDto> {
    const budget = await this.saveBudget.execute({
      ownerId: actor.id,
      year: params.year,
      month: params.month,
      totalLimit: dto.totalLimit === null ? null : parseMoney(dto.totalLimit),
      categoryLimits: dto.categoryLimits.map((entry) => ({
        categoryUuid: entry.categoryUuid,
        limit: parseMoney(entry.limit),
      })),
    });

    return BudgetResponseDto.fromDomain(budget, translate);
  }

  @(endpoint()
    .delete(':year/:month')
    .audit('Budget.delete')
    .successMessage('success.deleted')
    .tags('budgets')
    .summary('Remove your budget for a month')
    .description(
      `Removes the overall and category limits of the month; transactions never change. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'The month has no budget.')
    .build())
  async removeMine(
    @Param() params: BudgetMonthParamsDto,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteBudget.execute({
      ownerId: actor.id,
      year: params.year,
      month: params.month,
    });
  }
}
