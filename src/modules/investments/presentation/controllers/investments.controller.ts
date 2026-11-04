import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import { PendingOperationsResponseDto } from '@shared/presentation/dto';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateInvestmentUseCase } from '../../application/use-cases/create-investment.use-case';
import { DeleteInvestmentUseCase } from '../../application/use-cases/delete-investment.use-case';
import { GetInvestmentPendingOperationsUseCase } from '../../application/use-cases/get-investment-pending-operations.use-case';
import { GetInvestmentUseCase } from '../../application/use-cases/get-investment.use-case';
import { ListInvestmentsUseCase } from '../../application/use-cases/list-investments.use-case';
import { UpdateInvestmentStatusUseCase } from '../../application/use-cases/update-investment-status.use-case';
import { UpdateInvestmentUseCase } from '../../application/use-cases/update-investment.use-case';
import { CreateInvestmentDto } from '../dto/input/create-investment.dto';
import { ListInvestmentsQueryDto } from '../dto/input/list-investments-query.dto';
import { UpdateInvestmentStatusDto } from '../dto/input/update-investment-status.dto';
import { UpdateInvestmentDto } from '../dto/input/update-investment.dto';
import { InvestmentResponseDto } from '../dto/output/investment.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's investment answers 404, whatever the caller's roles.";

function optionalMoney(value: string | null | undefined): number | null {
  return value === undefined || value === null ? null : parseMoney(value);
}

@Controller('investments')
export class InvestmentsController {
  constructor(
    private readonly listInvestments: ListInvestmentsUseCase,
    private readonly getInvestment: GetInvestmentUseCase,
    private readonly getInvestmentPendingOperations: GetInvestmentPendingOperationsUseCase,
    private readonly createInvestment: CreateInvestmentUseCase,
    private readonly updateInvestment: UpdateInvestmentUseCase,
    private readonly updateInvestmentStatus: UpdateInvestmentStatusUseCase,
    private readonly deleteInvestment: DeleteInvestmentUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('investments')
    .summary("List the authenticated user's investments, reserves, and goals")
    .description(
      `Defaults to ACTIVE ones, ordered by name, each with its current value. ${OWNERSHIP_NOTE}`,
    )
    .paginatedResponse(InvestmentResponseDto)
    .build())
  async findAll(
    @Query() query: ListInvestmentsQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<InvestmentResponseDto>> {
    const investments = await this.listInvestments.execute({
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      name: query.name,
      type: query.type,
      status: query.status,
    });

    return investments.map((entry) =>
      InvestmentResponseDto.fromDomain(entry, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('investments')
    .summary('Get one of your investments by uuid')
    .description(OWNERSHIP_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Investment is archived.')
    .response(InvestmentResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentResponseDto> {
    return InvestmentResponseDto.fromDomain(
      await this.getInvestment.execute(uuid, actor.id),
      translate,
    );
  }

  @(endpoint()
    .get(':uuid/pending-operations')
    .successMessage('success.ok')
    .tags('investments')
    .summary('Summarize the planned movements of one of your investments')
    .description(
      `Count and total of its planned contributions and withdrawals, archived investments included. Completed and canceled movements never count. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment not found.')
    .response(PendingOperationsResponseDto)
    .build())
  async findPendingOperations(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<PendingOperationsResponseDto> {
    return PendingOperationsResponseDto.fromSummary(
      await this.getInvestmentPendingOperations.execute(uuid, actor.id),
    );
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('Investment.create')
    .successMessage('success.created')
    .tags('investments')
    .summary('Create an investment, reserve, or goal')
    .description(
      'It starts with a value of 0: record contributions from an account, or a valuation for money already invested.',
    )
    .body(CreateInvestmentDto)
    .response(InvestmentResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateInvestmentDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentResponseDto> {
    const investment = await this.createInvestment.execute({
      ownerId: actor.id,
      name: dto.name,
      type: dto.type,
      targetAmount: optionalMoney(dto.targetAmount),
    });

    return InvestmentResponseDto.fromDomain(investment, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('Investment.update')
    .successMessage('success.updated')
    .tags('investments')
    .summary('Update one of your investments')
    .description(
      `Partial update; targetAmount null removes the target. The value only changes through movements. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Investment is archived.')
    .body(UpdateInvestmentDto)
    .response(InvestmentResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateInvestmentDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentResponseDto> {
    const investment = await this.updateInvestment.execute({
      uuid,
      ownerId: actor.id,
      name: dto.name,
      type: dto.type,
      targetAmount:
        dto.targetAmount === undefined
          ? undefined
          : optionalMoney(dto.targetAmount),
    });

    return InvestmentResponseDto.fromDomain(investment, translate);
  }

  @(endpoint()
    .put(':uuid/status')
    .audit('Investment.update_status')
    .successMessage('success.updated')
    .tags('investments')
    .summary('Archive or reactivate one of your investments')
    .description(
      `Archiving (INACTIVE) keeps the investment with its movements and value but blocks new movements and valuations; existing planned movements can still be confirmed or canceled. An investment with planned movements also needs pendingOperations: KEEP leaves them planned and confirmable, CANCEL cancels them. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Investment has planned movements and pendingOperations is missing.',
    )
    .body(UpdateInvestmentStatusDto)
    .response(InvestmentResponseDto)
    .build())
  async updateStatus(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateInvestmentStatusDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<InvestmentResponseDto> {
    const investment = await this.updateInvestmentStatus.execute({
      uuid,
      ownerId: actor.id,
      status: dto.status,
      pendingOperations: dto.pendingOperations,
    });

    return InvestmentResponseDto.fromDomain(investment, translate);
  }

  @(endpoint()
    .delete(':uuid')
    .audit('Investment.delete')
    .successMessage('success.deleted')
    .tags('investments')
    .summary('Soft-delete one of your investments')
    .description(
      `An investment with movements cannot be deleted: archive it instead to keep its history. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Investment not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Investment has movements; archive it instead.',
    )
    .build())
  async remove(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteInvestment.execute({ uuid, ownerId: actor.id });
  }
}
