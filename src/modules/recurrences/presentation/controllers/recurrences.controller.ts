import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { financeToday } from '@shared/domain/calendar';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateRecurrenceUseCase } from '../../application/use-cases/create-recurrence.use-case';
import { EndRecurrenceUseCase } from '../../application/use-cases/end-recurrence.use-case';
import { GetRecurrenceUseCase } from '../../application/use-cases/get-recurrence.use-case';
import { ListRecurrencesUseCase } from '../../application/use-cases/list-recurrences.use-case';
import { UpdateRecurrenceStateUseCase } from '../../application/use-cases/update-recurrence-state.use-case';
import { UpdateRecurrenceUseCase } from '../../application/use-cases/update-recurrence.use-case';
import type { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { CreateRecurrenceDto } from '../dto/input/create-recurrence.dto';
import { EndRecurrenceDto } from '../dto/input/end-recurrence.dto';
import { ListRecurrencesQueryDto } from '../dto/input/list-recurrences-query.dto';
import { UpdateRecurrenceStateDto } from '../dto/input/update-recurrence-state.dto';
import { UpdateRecurrenceDto } from '../dto/input/update-recurrence.dto';
import { RecurrenceResponseDto } from '../dto/output/recurrence.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's recurrence answers 404, whatever the caller's roles.";

@Controller('recurrences')
export class RecurrencesController {
  constructor(
    private readonly listRecurrences: ListRecurrencesUseCase,
    private readonly getRecurrence: GetRecurrenceUseCase,
    private readonly createRecurrence: CreateRecurrenceUseCase,
    private readonly updateRecurrence: UpdateRecurrenceUseCase,
    private readonly updateRecurrenceState: UpdateRecurrenceStateUseCase,
    private readonly endRecurrence: EndRecurrenceUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('recurrences')
    .summary("List the authenticated user's recurrences")
    .description(`Ordered by description. ${OWNERSHIP_NOTE}`)
    .paginatedResponse(RecurrenceResponseDto)
    .build())
  async findAll(
    @Query() query: ListRecurrencesQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<RecurrenceResponseDto>> {
    const recurrences = await this.listRecurrences.execute({
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      state: query.state,
      type: query.type,
      description: query.description,
    });

    const today = financeToday();

    return recurrences.map((recurrence) =>
      RecurrenceResponseDto.fromDomain(recurrence, today, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('recurrences')
    .summary('Get one of your recurrences by uuid')
    .description(OWNERSHIP_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence not found.')
    .response(RecurrenceResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceResponseDto> {
    return this.toResponse(
      await this.getRecurrence.execute({ uuid, ownerId: actor.id }),
      translate,
    );
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('Recurrence.create')
    .successMessage('success.created')
    .tags('recurrences')
    .summary('Create a recurring income, expense, or card charge')
    .description(
      'Generates planned occurrences from startDate up to 12 months ahead, never twice for the same date; a daily job keeps extending them. Account recurrences generate planned transactions; card recurrences generate planned charges that become purchases once confirmed. Nothing is paid or received until an occurrence is confirmed. Account, card, and category resolve within your own records (404) and must be active (409).',
    )
    .errorResponse(
      HttpStatus.NOT_FOUND,
      'Account, card, or category not found.',
    )
    .errorResponse(
      HttpStatus.CONFLICT,
      'Account, card, or category is inactive.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Card on an income, category kind mismatch, end date before start date, or start date before the opening balance date of the account.',
    )
    .body(CreateRecurrenceDto)
    .response(RecurrenceResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateRecurrenceDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceResponseDto> {
    const recurrence = await this.createRecurrence.execute({
      ownerId: actor.id,
      type: dto.type,
      description: dto.description,
      amount: parseMoney(dto.amount),
      frequency: dto.frequency,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      accountUuid: dto.accountUuid,
      creditCardUuid: dto.creditCardUuid ?? undefined,
      categoryUuid: dto.categoryUuid,
      notes: dto.notes ?? null,
    });

    return this.toResponse(recurrence, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('Recurrence.update')
    .successMessage('success.updated')
    .tags('recurrences')
    .summary('Update a recurrence and its planned occurrences')
    .description(
      `Changes the template and, by scope, the planned occurrences scheduled on or after from (FUTURE) or all of them (ALL). Completed and canceled occurrences never change. Type, frequency, start date, card, and end date are fixed: end the recurrence and create a new one. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(
      HttpStatus.NOT_FOUND,
      'Recurrence, account, or category not found.',
    )
    .errorResponse(
      HttpStatus.CONFLICT,
      'Recurrence ended, or account or category inactive.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Account on a card recurrence, category kind mismatch, or a moved occurrence dated before the opening balance date of the new account.',
    )
    .body(UpdateRecurrenceDto)
    .response(RecurrenceResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateRecurrenceDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceResponseDto> {
    const recurrence = await this.updateRecurrence.execute({
      uuid,
      ownerId: actor.id,
      scope: dto.scope,
      from: dto.from,
      description: dto.description,
      amount: dto.amount === undefined ? undefined : parseMoney(dto.amount),
      categoryUuid: dto.categoryUuid,
      accountUuid: dto.accountUuid,
      notes: dto.notes,
    });

    return this.toResponse(recurrence, translate);
  }

  @(endpoint()
    .put(':uuid/state')
    .audit('Recurrence.updateState')
    .successMessage('success.updated')
    .tags('recurrences')
    .summary('Pause or resume a recurrence')
    .description(
      `PAUSED removes the planned occurrences dated today or later and stops generating; ACTIVE resumes from today without creating the dates skipped while paused. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Recurrence ended or already in that state.',
    )
    .body(UpdateRecurrenceStateDto)
    .response(RecurrenceResponseDto)
    .build())
  async updateState(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateRecurrenceStateDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceResponseDto> {
    return this.toResponse(
      await this.updateRecurrenceState.execute({
        uuid,
        ownerId: actor.id,
        state: dto.state,
      }),
      translate,
    );
  }

  @(endpoint()
    .put(':uuid/end')
    .audit('Recurrence.end')
    .successMessage('success.updated')
    .tags('recurrences')
    .summary('End a recurrence from a date or an invoice month')
    .description(
      `from: no occurrence on or after that date. fromInvoiceMonth (card recurrences): no charge on that invoice or later, so earlier invoices stay unchanged. Without either, or with a cut on or before the start date, the whole recurrence ends. Planned occurrences after the cut are removed; completed history stays. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Recurrence already ended.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Invoice month on an account recurrence.',
    )
    .body(EndRecurrenceDto)
    .response(RecurrenceResponseDto)
    .build())
  async end(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: EndRecurrenceDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceResponseDto> {
    return this.toResponse(
      await this.endRecurrence.execute({
        uuid,
        ownerId: actor.id,
        from: dto.from ?? undefined,
        fromInvoiceMonth: dto.fromInvoiceMonth ?? undefined,
      }),
      translate,
    );
  }

  private toResponse(
    recurrence: RecurrenceEntity,
    translate: Translate,
  ): RecurrenceResponseDto {
    return RecurrenceResponseDto.fromDomain(
      recurrence,
      financeToday(),
      translate,
    );
  }
}
