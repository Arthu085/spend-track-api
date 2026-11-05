import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DateOnlyField } from '@shared/presentation/dto';
import { isPresent } from './transaction-fields';

export const BULK_CONFIRMATION_MAX_ITEMS = 200;

export class BulkConfirmationItemDto {
  @ApiProperty({ description: 'One of your planned transactions.' })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  uuid!: string;

  @ValidateIf(isPresent)
  @DateOnlyField({
    example: '2026-11-05',
    required: false,
    description:
      'Effective date; defaults to today in America/Sao_Paulo and cannot be before the opening balance date of an account.',
  })
  completedOn?: string;
}

export class BulkConfirmTransactionsDto {
  @ApiProperty({
    type: [BulkConfirmationItemDto],
    minItems: 1,
    maxItems: BULK_CONFIRMATION_MAX_ITEMS,
    description:
      'Transactions to confirm, each at most once; split larger selections into several requests.',
  })
  @IsArray({ message: i18nValidationMessage('validation.IS_ARRAY') })
  @ArrayNotEmpty({
    message: i18nValidationMessage('validation.ARRAY_NOT_EMPTY'),
  })
  @ArrayMaxSize(BULK_CONFIRMATION_MAX_ITEMS, {
    message: i18nValidationMessage('validation.ARRAY_MAX_SIZE'),
  })
  @ArrayUnique((item: BulkConfirmationItemDto) => item.uuid, {
    message: i18nValidationMessage('validation.ARRAY_UNIQUE'),
  })
  @ValidateNested({ each: true })
  @Type(() => BulkConfirmationItemDto)
  items!: BulkConfirmationItemDto[];
}
