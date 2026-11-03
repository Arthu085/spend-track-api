import { ApiProperty } from '@nestjs/swagger';
import { ValidateIf } from 'class-validator';
import { isPresent } from '@modules/transactions/presentation';
import { InvestmentType } from '../../../domain/enums/investment-type.enum';
import {
  InvestmentNameField,
  InvestmentTargetAmountField,
  InvestmentTypeField,
} from './investment-fields';

export class CreateInvestmentDto {
  @InvestmentNameField()
  name!: string;

  @InvestmentTypeField()
  type!: InvestmentType;

  @ApiProperty({ type: String, nullable: true, required: false })
  @ValidateIf(isPresent)
  @InvestmentTargetAmountField()
  targetAmount?: string | null;
}
