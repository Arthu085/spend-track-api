import { ApiProperty } from '@nestjs/swagger';
import { TransactionState } from '@modules/transactions';
import { transactionStateLabel } from '@modules/transactions/presentation';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import type {
  SavingPlan,
  SavingPlanOccurrence,
} from '../../../application/services/saving-plans';
import { AdditionalContributionStrategy } from '../../../domain/enums/additional-contribution-strategy.enum';
import { RecurrenceFrequency } from '../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import {
  RecurrenceInvestmentRefResponseDto,
  additionalContributionLabel,
} from './recurrence.response';

export class SavingPlanRecurrenceResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: RecurrenceFrequency })
  frequency!: RecurrenceFrequency;

  @ApiProperty()
  frequencyLabel!: string;

  @ApiProperty({
    example: '700.00',
    description: 'Mandatory contribution per month.',
  })
  amount!: string;

  @ApiProperty({ enum: RecurrenceState })
  state!: RecurrenceState;

  @ApiProperty()
  stateLabel!: string;
}

export class SavingPlanAccountResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;
}

export class SavingPlanOccurrenceResponseDto {
  @ApiProperty({
    description:
      'Occurrence uuid, accepted by the occurrence routes of the recurrence.',
  })
  uuid!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-15' })
  date!: string;

  @ApiProperty({ example: '700.00' })
  amount!: string;

  @ApiProperty({ description: 'Date before today.' })
  overdue!: boolean;

  static fromDomain(
    occurrence: SavingPlanOccurrence,
  ): SavingPlanOccurrenceResponseDto {
    return Object.assign(new SavingPlanOccurrenceResponseDto(), {
      ...occurrence,
      amount: formatMoney(occurrence.amount),
    });
  }
}

export class SavingPlanMandatoryResponseDto {
  @ApiProperty({
    example: '700.00',
    description:
      'Planned mandatory contributions of this recurrence from its current account dated up to the end of the month, overdue ones included.',
  })
  planned!: string;

  @ApiProperty({
    example: '0.00',
    description:
      'Completed mandatory contributions of this recurrence dated in the month.',
  })
  completed!: string;

  @ApiProperty({ type: [SavingPlanOccurrenceResponseDto] })
  plannedOccurrences!: SavingPlanOccurrenceResponseDto[];
}

export class SavingPlanAdditionalResponseDto {
  @ApiProperty({
    description:
      'Investment movement; cancel it through the movement state route to free the month.',
  })
  movementUuid!: string;

  @ApiProperty({ example: '600.00' })
  amount!: string;

  @ApiProperty({ enum: TransactionState })
  state!: TransactionState;

  @ApiProperty()
  stateLabel!: string;

  @ApiProperty({
    example: '600.00',
    description: 'What was suggested when it was accepted.',
  })
  suggestedAmount!: string;
}

export class SavingPlanResponseDto {
  @ApiProperty({ type: SavingPlanRecurrenceResponseDto })
  recurrence!: SavingPlanRecurrenceResponseDto;

  @ApiProperty({ type: RecurrenceInvestmentRefResponseDto })
  investment!: RecurrenceInvestmentRefResponseDto;

  @ApiProperty({ type: SavingPlanAccountResponseDto })
  account!: SavingPlanAccountResponseDto;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-01',
    description: 'First day of the month.',
  })
  month!: string;

  @ApiProperty({ example: '1500.00', description: 'Current account balance.' })
  actualBalance!: string;

  @ApiProperty({
    example: '0.00',
    description:
      'Net planned transactions on the account dated up to the end of the month.',
  })
  plannedTransactions!: string;

  @ApiProperty({
    example: '0.00',
    description:
      "Net planned investment movements on the account dated up to the end of the month, without this recurrence's own mandatory contributions.",
  })
  otherInvestmentMovements!: string;

  @ApiProperty({
    example: '0.00',
    description:
      'Same as creditCards.outstanding + creditCards.plannedDue in the dashboard. Cards are not linked to accounts, so all of it is charged against this account: a conservative estimate.',
  })
  cardObligations!: string;

  @ApiProperty({
    example: '1500.00',
    description:
      'actualBalance + plannedTransactions + otherInvestmentMovements - cardObligations.',
  })
  balanceBeforeContribution!: string;

  @ApiProperty({ example: '200.00' })
  minimumRetainedBalance!: string;

  @ApiProperty({
    example: '1300.00',
    description: 'balanceBeforeContribution - minimumRetainedBalance.',
  })
  distributable!: string;

  @ApiProperty({
    example: '0.00',
    description:
      'How much the planned mandatory contributions exceed distributable, or 0.',
  })
  shortfall!: string;

  @ApiProperty({ enum: AdditionalContributionStrategy })
  additionalContribution!: AdditionalContributionStrategy;

  @ApiProperty()
  additionalContributionLabel!: string;

  @ApiProperty({ type: SavingPlanMandatoryResponseDto })
  mandatory!: SavingPlanMandatoryResponseDto;

  @ApiProperty({
    example: '600.00',
    description:
      'distributable minus the planned mandatory contributions, or 0. Also 0 without REMAINING_SURPLUS, for past months, and once the month has a live additional contribution. Only a suggestion: nothing is created until it is accepted, and it never changes a balance.',
  })
  suggestedAdditional!: string;

  @ApiProperty({
    type: SavingPlanAdditionalResponseDto,
    nullable: true,
    description: 'Live additional contribution of the month, if any.',
  })
  additional!: SavingPlanAdditionalResponseDto | null;

  @ApiProperty({
    description:
      'The month can still receive an additional contribution, whatever the suggested amount.',
  })
  canAcceptAdditional!: boolean;

  static fromDomain(
    plan: SavingPlan,
    translate: (key: string) => string,
  ): SavingPlanResponseDto {
    return Object.assign(new SavingPlanResponseDto(), {
      recurrence: Object.assign(new SavingPlanRecurrenceResponseDto(), {
        uuid: plan.recurrence.uuid,
        description: plan.recurrence.description,
        frequency: plan.recurrence.frequency,
        frequencyLabel: translateOrFallback(
          translate,
          `recurrences.frequency.${plan.recurrence.frequency.toLowerCase()}`,
          plan.recurrence.frequency,
        ),
        amount: formatMoney(plan.recurrence.amount),
        state: plan.state,
        stateLabel: translateOrFallback(
          translate,
          `recurrences.state.${plan.state.toLowerCase()}`,
          plan.state,
        ),
      }),
      investment: RecurrenceInvestmentRefResponseDto.fromDomain(
        plan.investment,
        translate,
      ),
      account: Object.assign(new SavingPlanAccountResponseDto(), {
        uuid: plan.account.uuid,
        name: plan.account.name,
        status: plan.account.status,
      }),
      month: plan.month,
      actualBalance: formatMoney(plan.actualBalance),
      plannedTransactions: formatMoney(plan.plannedTransactions),
      otherInvestmentMovements: formatMoney(plan.otherInvestmentMovements),
      cardObligations: formatMoney(plan.cardObligations),
      balanceBeforeContribution: formatMoney(plan.balanceBeforeContribution),
      minimumRetainedBalance: formatMoney(plan.strategy.minimumRetainedBalance),
      distributable: formatMoney(plan.distributable),
      shortfall: formatMoney(plan.shortfall),
      additionalContribution: plan.strategy.additionalContribution,
      additionalContributionLabel: additionalContributionLabel(
        plan.strategy.additionalContribution,
        translate,
      ),
      mandatory: Object.assign(new SavingPlanMandatoryResponseDto(), {
        planned: formatMoney(plan.mandatory.planned),
        completed: formatMoney(plan.mandatory.completed),
        plannedOccurrences: plan.mandatory.plannedOccurrences.map(
          (occurrence) =>
            SavingPlanOccurrenceResponseDto.fromDomain(occurrence),
        ),
      }),
      suggestedAdditional: formatMoney(plan.suggestedAdditional),
      additional: plan.additional
        ? Object.assign(new SavingPlanAdditionalResponseDto(), {
            movementUuid: plan.additional.uuid,
            amount: formatMoney(plan.additional.amount),
            state: plan.additional.state,
            stateLabel: transactionStateLabel(plan.additional.state, translate),
            suggestedAmount: formatMoney(plan.additional.suggestedAmount ?? 0),
          })
        : null,
      canAcceptAdditional: plan.canAcceptAdditional,
    });
  }
}
