import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { FINANCE_NAME_MAX_LENGTH } from '@shared/domain/constraints';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  PaginationQueryDto,
  StatusFilterField,
  TextFilterField,
} from '@shared/presentation/dto';
import { InvestmentType } from '../../../domain/enums/investment-type.enum';

export class ListInvestmentsQueryDto extends PaginationQueryDto {
  @TextFilterField({ maxLength: FINANCE_NAME_MAX_LENGTH })
  name?: string;

  @ApiPropertyOptional({
    enum: InvestmentType,
    description: 'Filter by type (exact match).',
  })
  @IsOptional()
  @IsEnum(InvestmentType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type?: InvestmentType;

  @StatusFilterField()
  status?: RecordStatus;
}
