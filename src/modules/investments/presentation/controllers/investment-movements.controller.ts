import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import { PaginationQueryDto } from '@shared/presentation/dto';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateInvestmentMovementUseCase } from '../../application/use-cases/create-investment-movement.use-case';
import { CreateInvestmentValuationUseCase } from '../../application/use-cases/create-investment-valuation.use-case';
import { ListInvestmentMovementsUseCase } from '../../application/use-cases/list-investment-movements.use-case';
import { UpdateInvestmentMovementStateUseCase } from '../../application/use-cases/update-investment-movement-state.use-case';
import { CreateInvestmentMovementDto } from '../dto/input/create-investment-movement.dto';
import { CreateInvestmentValuationDto } from '../dto/input/create-investment-valuation.dto';
import { UpdateInvestmentMovementStateDto } from '../dto/input/update-investment-movement-state.dto';
import { InvestmentMovementResponseDto } from '../dto/output/investment-movement.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's investment, movement, or account answers 404, whatever the caller's roles.";

@Controller('investments')
export class InvestmentMovementsController {
  constructor(
    private readonly listInvestmentMovements: ListInvestmentMovementsUseCase,
    private readonly createInvestmentMovement: CreateInvestmentMovementUseCase,
    private readonly createInvestmentValuation: CreateInvestmentValuationUseCase,
    private readonly updateInvestmentMovementState: UpdateInvestmentMovementStateUseCase,
  ) {}

  @(endpoint()
    .get(':uuid/movements')
    .successMessage('success.ok')
    .tags('investments')
    .summary(
      'List the contributions, withdrawals, and valuations of one of your investments',
    )
    .description(
      `Newest date first, canceled ones included as history, archived investments included. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment not found.')
    .paginatedResponse(InvestmentMovementResponseDto)
    .build())
  async findAll(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Query() query: PaginationQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<InvestmentMovementResponseDto>> {
    const movements = await this.listInvestmentMovements.execute({
      investmentUuid: uuid,
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
    });

    return movements.map((movement) =>
      InvestmentMovementResponseDto.fromDomain(movement, translate),
    );
  }

  @(endpoint()
    .post(':uuid/movements')
    .httpCode(HttpStatus.CREATED)
    .audit('InvestmentMovement.create')
    .successMessage('success.created')
    .tags('investments')
    .summary('Contribute to or withdraw from one of your investments')
    .description(
      `Moves money between an account and the investment; never counted as income or spending. A completed movement changes the account balance and the investment value at once; a planned one only affects projections until confirmed. completedOn defaults to date. A completed withdrawal cannot exceed the current value (422). ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment or account not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Investment is archived or account is inactive.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Withdrawal exceeds the current value.',
    )
    .body(CreateInvestmentMovementDto)
    .response(InvestmentMovementResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: CreateInvestmentMovementDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentMovementResponseDto> {
    const movement = await this.createInvestmentMovement.execute({
      investmentUuid: uuid,
      ownerId: actor.id,
      type: dto.type,
      accountUuid: dto.accountUuid,
      amount: parseMoney(dto.amount),
      date: dto.date,
      state: dto.state,
      completedOn: dto.completedOn ?? undefined,
    });

    return InvestmentMovementResponseDto.fromDomain(movement, translate);
  }

  @(endpoint()
    .post(':uuid/valuations')
    .httpCode(HttpStatus.CREATED)
    .audit('InvestmentMovement.valuate')
    .successMessage('success.created')
    .tags('investments')
    .summary('Update the current value of one of your investments manually')
    .description(
      `Records the difference between value and the current value as a completed VALUATION movement. It changes the investment value only, never an account balance. date defaults to today in America/Sao_Paulo. A value equal to the current one answers 422. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Investment is archived.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'The value equals the current value.',
    )
    .body(CreateInvestmentValuationDto)
    .response(InvestmentMovementResponseDto, HttpStatus.CREATED)
    .build())
  async valuate(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: CreateInvestmentValuationDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentMovementResponseDto> {
    const movement = await this.createInvestmentValuation.execute({
      investmentUuid: uuid,
      ownerId: actor.id,
      value: parseMoney(dto.value),
      date: dto.date ?? undefined,
    });

    return InvestmentMovementResponseDto.fromDomain(movement, translate);
  }

  @(endpoint()
    .put(':uuid/movements/:movementUuid/state')
    .audit('InvestmentMovement.update_state')
    .successMessage('success.updated')
    .tags('investments')
    .summary('Confirm or cancel a movement of one of your investments')
    .description(
      `PLANNED → COMPLETED (completedOn defaults to today in America/Sao_Paulo; needs an active investment and account), PLANNED → CANCELED, or COMPLETED → CANCELED, which keeps the movement as history and reverses its effect. A change that would leave the value below 0 answers 422. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment or movement not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Invalid state transition, archived investment, or inactive account.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'The value would fall below 0.',
    )
    .body(UpdateInvestmentMovementStateDto)
    .response(InvestmentMovementResponseDto)
    .build())
  async updateState(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Param('movementUuid', ParseUuidParamPipe) movementUuid: string,
    @Body() dto: UpdateInvestmentMovementStateDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentMovementResponseDto> {
    const movement = await this.updateInvestmentMovementState.execute({
      investmentUuid: uuid,
      movementUuid,
      ownerId: actor.id,
      state: dto.state,
      completedOn: dto.completedOn ?? undefined,
    });

    return InvestmentMovementResponseDto.fromDomain(movement, translate);
  }
}
