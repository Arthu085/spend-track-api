import { Matches, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { AllowedOnlyWhen, isPresent } from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';

const FIRST_DAY_OF_MONTH_PATTERN = /-01$/;

export class EndRecurrenceDto {
  @ValidateIf(isPresent)
  @DateOnlyField({
    example: '2026-12-01',
    required: false,
    description: 'No occurrence on or after this date.',
  })
  from?: string;

  @ValidateIf(isPresent)
  @DateOnlyField({
    example: '2026-12-01',
    required: false,
    description:
      'Card recurrences only, first day of the month: no charge on this invoice month or later. Not allowed with from.',
  })
  @Matches(FIRST_DAY_OF_MONTH_PATTERN, {
    message: i18nValidationMessage('validation.FIRST_DAY_OF_MONTH'),
  })
  @AllowedOnlyWhen((dto: EndRecurrenceDto) => !isPresent(dto, dto.from))
  fromInvoiceMonth?: string;
}
