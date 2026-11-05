import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TransactionAmountField } from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';

export class RecordHistoricalSettlementDto {
  @ApiProperty({
    description:
      'An account of yours, active or archived, whose opening balance already includes this payment.',
  })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  accountUuid!: string;

  @TransactionAmountField()
  amount!: string;

  @DateOnlyField({ example: '2026-10-12' })
  paidOn!: string;
}
