import { ApiProperty } from '@nestjs/swagger';
import type { AccountEntity } from '@modules/accounts';
import {
  TransactionCategoryKind,
  type TransactionCategoryEntity,
} from '@modules/transaction-categories';
import { transactionCategoryName } from '@modules/transaction-categories/presentation';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import { TransactionEntity } from '../../../domain/entities/transaction.entity';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../domain/enums/transaction-type.enum';

export function transactionTypeLabel(
  type: TransactionType,
  translate: (key: string) => string,
): string {
  return translateOrFallback(
    translate,
    `transactions.type.${type.toLowerCase()}`,
    type,
  );
}

export function transactionStateLabel(
  state: TransactionState,
  translate: (key: string) => string,
): string {
  return translateOrFallback(
    translate,
    `transactions.state.${state.toLowerCase()}`,
    state,
  );
}

export class TransactionAccountResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  static fromDomain(account: AccountEntity): TransactionAccountResponseDto {
    return Object.assign(new TransactionAccountResponseDto(), {
      uuid: account.uuid,
      name: account.name,
      status: account.status,
    });
  }
}

export class TransactionCategoryRefResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({
    description:
      'Global transaction categories are named in the request language.',
  })
  name!: string;

  @ApiProperty({ enum: TransactionCategoryKind })
  kind!: TransactionCategoryKind;

  @ApiProperty({ type: String, nullable: true, example: '#1A2B3C' })
  color!: string | null;

  @ApiProperty({
    enum: RecordStatus,
    description:
      "The category's record status (ACTIVE or INACTIVE). Categories stay on the transactions that use them after being deactivated or deleted; a deleted category keeps the status it had, so deletion is not distinguishable here.",
  })
  status!: RecordStatus;

  static fromDomain(
    category: TransactionCategoryEntity,
    translate: (key: string) => string,
  ): TransactionCategoryRefResponseDto {
    return Object.assign(new TransactionCategoryRefResponseDto(), {
      uuid: category.uuid,
      name: transactionCategoryName(category, translate),
      kind: category.kind,
      color: category.color,
      status: category.status,
    });
  }
}

export class TransactionResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({
    example: '250.40',
    description: 'Strictly positive decimal string in BRL.',
  })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-29' })
  date!: string;

  @ApiProperty({ enum: TransactionState })
  state!: TransactionState;

  @ApiProperty()
  stateLabel!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: null,
    description:
      'Effective payment or receipt date; null while planned, kept when a completed transaction is canceled.',
  })
  completedOn!: string | null;

  @ApiProperty({ type: Date, nullable: true, example: null })
  canceledAt!: Date | null;

  @ApiProperty({ type: TransactionAccountResponseDto })
  account!: TransactionAccountResponseDto;

  @ApiProperty({
    type: TransactionAccountResponseDto,
    nullable: true,
    description: 'Destination of a transfer; null for other types.',
  })
  destinationAccount!: TransactionAccountResponseDto | null;

  @ApiProperty({
    type: TransactionCategoryRefResponseDto,
    nullable: true,
    description: 'Null for transfers.',
  })
  category!: TransactionCategoryRefResponseDto | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    transaction: TransactionEntity,
    translate: (key: string) => string,
  ): TransactionResponseDto {
    const dto = new TransactionResponseDto();

    dto.uuid = transaction.uuid;
    dto.type = transaction.type;
    dto.typeLabel = transactionTypeLabel(transaction.type, translate);
    dto.description = transaction.description;
    dto.amount = formatMoney(transaction.amount);
    dto.date = transaction.date;
    dto.state = transaction.state;
    dto.stateLabel = transactionStateLabel(transaction.state, translate);
    dto.completedOn = transaction.completedOn;
    dto.canceledAt = transaction.canceledAt;
    dto.account = TransactionAccountResponseDto.fromDomain(transaction.account);
    dto.destinationAccount = transaction.destinationAccount
      ? TransactionAccountResponseDto.fromDomain(transaction.destinationAccount)
      : null;
    dto.category = transaction.category
      ? TransactionCategoryRefResponseDto.fromDomain(
          transaction.category,
          translate,
        )
      : null;
    dto.notes = transaction.notes;
    dto.createdAt = transaction.createdAt;
    dto.updatedAt = transaction.updatedAt;

    return dto;
  }
}
