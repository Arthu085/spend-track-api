import { ApiProperty } from '@nestjs/swagger';
import type { Translate } from '@shared/presentation/decorators';
import type { BulkConfirmationResult } from '../../../application/use-cases/bulk-confirm-transactions.use-case';
import type { PendingConfirmation } from '../../../application/use-cases/list-pending-confirmations.use-case';
import { BulkConfirmationOutcome } from '../../../domain/enums/bulk-confirmation-outcome.enum';
import { ConfirmationBlockedReason } from '../../../domain/enums/confirmation-blocked-reason.enum';
import { TransactionResponseDto } from './transaction.response';

export class PendingConfirmationItemResponseDto extends TransactionResponseDto {
  @ApiProperty({ description: 'Dated before today.' })
  overdue!: boolean;

  @ApiProperty({
    description:
      'Dated after today; confirm it only through an explicit selection.',
  })
  future!: boolean;

  @ApiProperty({ description: 'Whether it can be confirmed today.' })
  confirmable!: boolean;

  @ApiProperty({
    enum: ConfirmationBlockedReason,
    nullable: true,
    example: null,
    description: 'Why it cannot be confirmed; null when confirmable.',
  })
  blockedReason!: ConfirmationBlockedReason | null;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-01-01',
    description:
      'Earliest valid completedOn: the latest opening balance date of its accounts.',
  })
  earliestCompletedOn!: string;

  static fromPending(
    pending: PendingConfirmation,
    translate: (key: string) => string,
  ): PendingConfirmationItemResponseDto {
    return Object.assign(
      new PendingConfirmationItemResponseDto(),
      TransactionResponseDto.fromDomain(pending.transaction, translate),
      {
        overdue: pending.overdue,
        future: pending.future,
        confirmable: pending.blockedReason === null,
        blockedReason: pending.blockedReason,
        earliestCompletedOn: pending.earliestCompletedOn,
      },
    );
  }
}

export class PendingConfirmationsResponseDto {
  @ApiProperty({ type: [PendingConfirmationItemResponseDto] })
  items!: PendingConfirmationItemResponseDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  static fromPending(
    pending: readonly PendingConfirmation[],
    translate: (key: string) => string,
  ): PendingConfirmationsResponseDto {
    return Object.assign(new PendingConfirmationsResponseDto(), {
      items: pending.map((entry) =>
        PendingConfirmationItemResponseDto.fromPending(entry, translate),
      ),
      total: pending.length,
    });
  }
}

export class BulkConfirmationResultResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: BulkConfirmationOutcome })
  outcome!: BulkConfirmationOutcome;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Localized reason when FAILED; null otherwise.',
  })
  message!: string | null;

  @ApiProperty({
    type: TransactionResponseDto,
    nullable: true,
    description: 'The transaction after the operation; null when FAILED.',
  })
  transaction!: TransactionResponseDto | null;

  static fromResult(
    result: BulkConfirmationResult,
    translate: Translate,
  ): BulkConfirmationResultResponseDto {
    return Object.assign(new BulkConfirmationResultResponseDto(), {
      uuid: result.uuid,
      outcome: result.outcome,
      message: result.error
        ? translate(result.error.messageKey, { args: result.error.args })
        : null,
      transaction: result.transaction
        ? TransactionResponseDto.fromDomain(result.transaction, translate)
        : null,
    });
  }
}

export class BulkConfirmationResponseDto {
  @ApiProperty({ type: [BulkConfirmationResultResponseDto] })
  results!: BulkConfirmationResultResponseDto[];

  @ApiProperty({ example: 3 })
  confirmedCount!: number;

  @ApiProperty({ example: 0 })
  alreadyCompletedCount!: number;

  @ApiProperty({ example: 1 })
  failedCount!: number;

  static fromResults(
    results: readonly BulkConfirmationResult[],
    translate: Translate,
  ): BulkConfirmationResponseDto {
    const countOf = (outcome: BulkConfirmationOutcome): number =>
      results.filter((result) => result.outcome === outcome).length;

    return Object.assign(new BulkConfirmationResponseDto(), {
      results: results.map((result) =>
        BulkConfirmationResultResponseDto.fromResult(result, translate),
      ),
      confirmedCount: countOf(BulkConfirmationOutcome.CONFIRMED),
      alreadyCompletedCount: countOf(BulkConfirmationOutcome.ALREADY_COMPLETED),
      failedCount: countOf(BulkConfirmationOutcome.FAILED),
    });
  }
}
