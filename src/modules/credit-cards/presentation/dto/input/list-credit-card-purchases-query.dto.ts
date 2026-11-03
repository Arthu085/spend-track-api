import { ValidateIf } from 'class-validator';
import { isProvided } from '@modules/transactions/presentation';
import {
  DateOnlyField,
  PaginationQueryDto,
  TextFilterField,
  UuidFilterField,
} from '@shared/presentation/dto';

export class ListCreditCardPurchasesQueryDto extends PaginationQueryDto {
  @UuidFilterField(
    'Purchases made with this card; an unknown card matches nothing.',
  )
  cardUuid?: string;

  @UuidFilterField(
    'Purchases in this category; an unknown category matches nothing.',
  )
  categoryUuid?: string;

  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2026-10-01', required: false })
  from?: string;

  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2026-10-31', required: false })
  to?: string;

  @TextFilterField({ maxLength: 150 })
  description?: string;
}
