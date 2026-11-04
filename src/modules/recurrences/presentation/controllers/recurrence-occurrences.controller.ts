import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { parseMoney } from '@shared/domain/money';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CancelRecurrenceOccurrenceUseCase } from '../../application/use-cases/cancel-recurrence-occurrence.use-case';
import { ConfirmRecurrenceOccurrenceUseCase } from '../../application/use-cases/confirm-recurrence-occurrence.use-case';
import { ListRecurrenceOccurrencesUseCase } from '../../application/use-cases/list-recurrence-occurrences.use-case';
import { UpdateRecurrenceOccurrenceUseCase } from '../../application/use-cases/update-recurrence-occurrence.use-case';
import { ListRecurrenceOccurrencesQueryDto } from '../dto/input/list-recurrence-occurrences-query.dto';
import { RecurrenceOccurrenceScheduleDto } from '../dto/input/recurrence-occurrence-schedule.dto';
import { RecurrenceOccurrenceResponseDto } from '../dto/output/recurrence-occurrence.response';

const OWNERSHIP_NOTE =
  "Scoped to the authenticated user: another user's recurrence or occurrence answers 404, whatever the caller's roles.";

const ENDED_RECURRENCE_NOTE =
  'Also available when the recurrence is ENDED: ending freezes the template and stops generation, not the planned occurrences it kept.';

const amountOf = (dto: RecurrenceOccurrenceScheduleDto): number | undefined =>
  dto.amount === undefined || dto.amount === null
    ? undefined
    : parseMoney(dto.amount);

@Controller('recurrences/:uuid/occurrences')
export class RecurrenceOccurrencesController {
  constructor(
    private readonly listOccurrences: ListRecurrenceOccurrencesUseCase,
    private readonly updateOccurrence: UpdateRecurrenceOccurrenceUseCase,
    private readonly confirmOccurrence: ConfirmRecurrenceOccurrenceUseCase,
    private readonly cancelOccurrence: CancelRecurrenceOccurrenceUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('recurrences')
    .summary('List the occurrences of one of your recurrences')
    .description(
      `Ordered by scheduled date, oldest first; from/to are inclusive on occurrenceDate. ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence not found.')
    .paginatedResponse(RecurrenceOccurrenceResponseDto)
    .build())
  async findAll(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Query() query: ListRecurrenceOccurrencesQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<RecurrenceOccurrenceResponseDto>> {
    const occurrences = await this.listOccurrences.execute({
      uuid,
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      from: query.from,
      to: query.to,
      state: query.state,
    });

    return occurrences.map((occurrence) =>
      RecurrenceOccurrenceResponseDto.fromDomain(occurrence, translate),
    );
  }

  @(endpoint()
    .patch(':occurrenceUuid')
    .audit('RecurrenceOccurrence.update')
    .successMessage('success.updated')
    .tags('recurrences')
    .summary('Change the amount or date of one planned occurrence')
    .description(
      `Only this occurrence changes; the recurrence and its other occurrences stay. ${ENDED_RECURRENCE_NOTE} ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence or occurrence not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Occurrence is not planned.')
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'The date is before the opening balance date of the account.',
    )
    .body(RecurrenceOccurrenceScheduleDto)
    .response(RecurrenceOccurrenceResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Param('occurrenceUuid', ParseUuidParamPipe) occurrenceUuid: string,
    @Body() dto: RecurrenceOccurrenceScheduleDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceOccurrenceResponseDto> {
    const occurrence = await this.updateOccurrence.execute({
      uuid,
      occurrenceUuid,
      ownerId: actor.id,
      amount: amountOf(dto),
      date: dto.date ?? undefined,
    });

    return RecurrenceOccurrenceResponseDto.fromDomain(occurrence, translate);
  }

  @(endpoint()
    .put(':occurrenceUuid/confirmation')
    .audit('RecurrenceOccurrence.confirm')
    .successMessage('success.updated')
    .tags('recurrences')
    .summary('Confirm that a planned occurrence actually happened')
    .description(
      `The amount and date may differ from the template. An account occurrence becomes a completed transaction paid or received on date (default today) and changes the balance once. A card charge becomes a single-installment purchase dated date (default its planned date) on the matching invoice. ${ENDED_RECURRENCE_NOTE} ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence or occurrence not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Occurrence is not planned, or account, card, or category is inactive.',
    )
    .errorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'A date is before the opening balance date of the account.',
    )
    .body(RecurrenceOccurrenceScheduleDto)
    .response(RecurrenceOccurrenceResponseDto)
    .build())
  async confirm(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Param('occurrenceUuid', ParseUuidParamPipe) occurrenceUuid: string,
    @Body() dto: RecurrenceOccurrenceScheduleDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceOccurrenceResponseDto> {
    const occurrence = await this.confirmOccurrence.execute({
      uuid,
      occurrenceUuid,
      ownerId: actor.id,
      amount: amountOf(dto),
      date: dto.date ?? undefined,
    });

    return RecurrenceOccurrenceResponseDto.fromDomain(occurrence, translate);
  }

  @(endpoint()
    .put(':occurrenceUuid/cancellation')
    .audit('RecurrenceOccurrence.cancel')
    .successMessage('success.updated')
    .tags('recurrences')
    .summary('Skip one planned occurrence')
    .description(
      `The occurrence stays listed as CANCELED and is never generated again. ${ENDED_RECURRENCE_NOTE} ${OWNERSHIP_NOTE}`,
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Recurrence or occurrence not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Occurrence is not planned.')
    .response(RecurrenceOccurrenceResponseDto)
    .build())
  async cancel(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Param('occurrenceUuid', ParseUuidParamPipe) occurrenceUuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<RecurrenceOccurrenceResponseDto> {
    const occurrence = await this.cancelOccurrence.execute({
      uuid,
      occurrenceUuid,
      ownerId: actor.id,
    });

    return RecurrenceOccurrenceResponseDto.fromDomain(occurrence, translate);
  }
}
