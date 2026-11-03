import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TransactionState } from '@modules/transactions';
import { isProvided } from '@modules/transactions/presentation';
import { DateOnlyField, PaginationQueryDto } from '@shared/presentation/dto';

export class ListRecurrenceOccurrencesQueryDto extends PaginationQueryDto {
  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2026-11-01', required: false })
  from?: string;

  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2027-10-31', required: false })
  to?: string;

  @ApiPropertyOptional({ enum: TransactionState })
  @IsOptional()
  @IsEnum(TransactionState, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state?: TransactionState;
}
