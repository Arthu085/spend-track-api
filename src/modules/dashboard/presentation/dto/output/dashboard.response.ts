import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '@modules/accounts';
import { accountTypeLabel } from '@modules/accounts/presentation';
import {
  CreditCardInvoiceListResponseDto,
  CreditCardRefResponseDto,
} from '@modules/credit-cards/presentation';
import { InvestmentType } from '@modules/investments';
import {
  InvestmentProgressResponseDto,
  investmentTypeLabel,
} from '@modules/investments/presentation';
import { SpendingPerspective } from '@modules/preferences';
import { SavingPlanResponseDto } from '@modules/recurrences/presentation';
import { spendingPerspectiveLabel } from '@modules/preferences/presentation';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { transactionCategoryName } from '@modules/transaction-categories/presentation';
import { TransactionType } from '@modules/transactions';
import {
  TransactionAccountResponseDto,
  transactionTypeLabel,
} from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import type {
  DashboardAccountBalance,
  DashboardAmounts,
  DashboardBudget,
  DashboardBudgetCategory,
  DashboardBudgetLimit,
  DashboardCategoryExpenses,
  DashboardCreditCards,
  DashboardInvestments,
  DashboardPlannedCardCharge,
  DashboardSummary,
  DashboardUpcomingItem,
} from '../../../application/use-cases/get-dashboard.use-case';
import {
  SpendingGuidanceBasis,
  type SpendingGuidance,
} from '../../../domain/budget/spending-guidance';
import {
  PeriodTiming,
  type MonthPeriod,
} from '../../../domain/period/month-period';

export class DashboardPeriodResponseDto {
  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 10 })
  month!: number;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  endDate!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-29',
    description: 'Current date in America/Sao_Paulo.',
  })
  today!: string;

  @ApiProperty({ example: 31 })
  daysInMonth!: number;

  @ApiProperty({ enum: PeriodTiming })
  timing!: PeriodTiming;

  @ApiProperty({
    example: 3,
    description:
      'Days left including today: every day for a future month, 0 for a past one.',
  })
  remainingDays!: number;

  static fromDomain(period: MonthPeriod): DashboardPeriodResponseDto {
    return Object.assign(new DashboardPeriodResponseDto(), period);
  }
}

export class DashboardBalancesResponseDto {
  @ApiProperty({
    example: '1500.00',
    description: 'Sum of the actual balances of active accounts.',
  })
  actual!: string;

  @ApiProperty({
    example: '1500.00',
    description:
      'Expected balance of active accounts at the end of the period: the actual balance plus every planned transaction and planned investment contribution or withdrawal dated up to the end of the period, overdue ones included.',
  })
  projected!: string;

  @ApiProperty({
    example: '300.00',
    description:
      'projected minus creditCards.outstanding and creditCards.plannedDue: what is left once the card invoices of the period and earlier ones, and the planned recurring card charges expected on them, are paid. Never depends on the spending perspective.',
  })
  available!: string;
}

export class DashboardCategoryResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({
    description:
      'Global transaction categories are named in the request language.',
  })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: '#1A2B3C' })
  color!: string | null;

  static fromDomain(
    category: TransactionCategoryEntity,
    translate: (key: string) => string,
  ): DashboardCategoryResponseDto {
    return Object.assign(new DashboardCategoryResponseDto(), {
      uuid: category.uuid,
      name: transactionCategoryName(category, translate),
      color: category.color,
    });
  }
}

export class DashboardPlannedCardChargeResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ description: 'Recurrence that generated the charge.' })
  recurrenceUuid!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: '55.90', description: 'Decimal string in BRL.' })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-15' })
  date!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-01',
    description: 'First day of the month of the invoice it is expected on.',
  })
  invoiceMonth!: string;

  @ApiProperty({ description: 'True when date is before today.' })
  overdue!: boolean;

  @ApiProperty({ type: CreditCardRefResponseDto })
  card!: CreditCardRefResponseDto;

  @ApiProperty({ type: DashboardCategoryResponseDto })
  category!: DashboardCategoryResponseDto;

  static fromDomain(
    { charge, recurrenceUuid, card, overdue }: DashboardPlannedCardCharge,
    translate: (key: string) => string,
  ): DashboardPlannedCardChargeResponseDto {
    return Object.assign(new DashboardPlannedCardChargeResponseDto(), {
      uuid: charge.uuid,
      recurrenceUuid,
      description: charge.description,
      amount: formatMoney(charge.amount),
      date: charge.date,
      invoiceMonth: charge.invoiceMonth,
      overdue,
      card: CreditCardRefResponseDto.fromDomain(card),
      category: DashboardCategoryResponseDto.fromDomain(
        charge.category,
        translate,
      ),
    });
  }
}

export class DashboardCreditCardsResponseDto {
  @ApiProperty({
    example: '450.00',
    description:
      'Card spending of the period in the selected perspective (installments by their date, or by invoice month), net of refunds; already included in expenses.completed.',
  })
  spending!: string;

  @ApiProperty({
    example: '55.90',
    description:
      'Planned recurring card charges of the period in the selected perspective (by charge date, or by expected invoice month), not confirmed yet; already included in expenses.pending.',
  })
  planned!: string;

  @ApiProperty({
    example: '55.90',
    description:
      'Planned recurring card charges expected on the invoices of the period and earlier ones, by invoice month whatever the perspective; subtracted from balances.available.',
  })
  plannedDue!: string;

  @ApiProperty({
    example: '1200.00',
    description:
      'Unpaid amount of the invoices listed in invoices: those due in the period and earlier ones still unpaid.',
  })
  outstanding!: string;

  @ApiProperty({
    type: [CreditCardInvoiceListResponseDto],
    description:
      'Invoices due in the period, plus unpaid invoices of earlier months, earliest due date first.',
  })
  invoices!: CreditCardInvoiceListResponseDto[];

  @ApiProperty({
    type: [DashboardPlannedCardChargeResponseDto],
    description:
      'The first 10 planned recurring card charges counted by plannedDue, oldest first.',
  })
  plannedCharges!: DashboardPlannedCardChargeResponseDto[];

  @ApiProperty({
    example: 1,
    description: 'How many planned charges plannedDue counts.',
  })
  plannedChargesCount!: number;

  static fromDomain(
    creditCards: DashboardCreditCards,
    translate: (key: string) => string,
  ): DashboardCreditCardsResponseDto {
    return Object.assign(new DashboardCreditCardsResponseDto(), {
      spending: formatMoney(creditCards.spending),
      planned: formatMoney(creditCards.planned),
      plannedDue: formatMoney(creditCards.plannedDue),
      outstanding: formatMoney(creditCards.outstanding),
      invoices: creditCards.invoices.map((statement) =>
        CreditCardInvoiceListResponseDto.fromStatement(statement, translate),
      ),
      plannedCharges: creditCards.plannedCharges.map((item) =>
        DashboardPlannedCardChargeResponseDto.fromDomain(item, translate),
      ),
      plannedChargesCount: creditCards.plannedChargesCount,
    });
  }
}

export class DashboardAmountsResponseDto {
  @ApiProperty({
    example: '5000.00',
    description: 'completed + pending.',
  })
  total!: string;

  @ApiProperty({ example: '3000.00', description: 'COMPLETED transactions.' })
  completed!: string;

  @ApiProperty({ example: '2000.00', description: 'PLANNED transactions.' })
  pending!: string;

  static fromDomain(amounts: DashboardAmounts): DashboardAmountsResponseDto {
    return Object.assign(new DashboardAmountsResponseDto(), {
      total: formatMoney(amounts.total),
      completed: formatMoney(amounts.completed),
      pending: formatMoney(amounts.pending),
    });
  }
}

export class DashboardCategoryExpensesResponseDto extends DashboardAmountsResponseDto {
  @ApiProperty({ type: DashboardCategoryResponseDto })
  category!: DashboardCategoryResponseDto;

  static fromCategory(
    entry: DashboardCategoryExpenses,
    translate: (key: string) => string,
  ): DashboardCategoryExpensesResponseDto {
    return Object.assign(
      new DashboardCategoryExpensesResponseDto(),
      DashboardAmountsResponseDto.fromDomain(entry),
      {
        category: DashboardCategoryResponseDto.fromDomain(
          entry.category,
          translate,
        ),
      },
    );
  }
}

export class DashboardBudgetLimitResponseDto extends DashboardAmountsResponseDto {
  @ApiProperty({ example: '3000.00' })
  limit!: string;

  @ApiProperty({
    example: '1000.00',
    description: 'limit minus total, or 0 once the limit is reached.',
  })
  remaining!: string;

  @ApiProperty({
    example: '0.00',
    description:
      'total minus limit when spending exceeds the limit, otherwise 0. Informational only: budgets never block transactions.',
  })
  overspent!: string;

  static fromLimit(
    entry: DashboardBudgetLimit,
  ): DashboardBudgetLimitResponseDto {
    return Object.assign(
      new DashboardBudgetLimitResponseDto(),
      DashboardAmountsResponseDto.fromDomain(entry),
      {
        limit: formatMoney(entry.limit),
        remaining: formatMoney(entry.remaining),
        overspent: formatMoney(entry.overspent),
      },
    );
  }
}

export class DashboardBudgetCategoryResponseDto extends DashboardBudgetLimitResponseDto {
  @ApiProperty({ type: DashboardCategoryResponseDto })
  category!: DashboardCategoryResponseDto;

  static fromCategory(
    entry: DashboardBudgetCategory,
    translate: (key: string) => string,
  ): DashboardBudgetCategoryResponseDto {
    return Object.assign(
      new DashboardBudgetCategoryResponseDto(),
      DashboardBudgetLimitResponseDto.fromLimit(entry),
      {
        category: DashboardCategoryResponseDto.fromDomain(
          entry.category,
          translate,
        ),
      },
    );
  }
}

export class DashboardBudgetResponseDto {
  @ApiProperty({
    type: DashboardBudgetLimitResponseDto,
    nullable: true,
    description:
      'Overall limit against expenses (same total, completed, and pending); null when the budget has category limits only.',
  })
  overall!: DashboardBudgetLimitResponseDto | null;

  @ApiProperty({
    type: [DashboardBudgetCategoryResponseDto],
    description:
      'Each category limit against that category in expensesByCategory, in the order the limits were saved; a category without spending shows zeros.',
  })
  categories!: DashboardBudgetCategoryResponseDto[];

  static fromDomain(
    budget: DashboardBudget,
    translate: (key: string) => string,
  ): DashboardBudgetResponseDto {
    return Object.assign(new DashboardBudgetResponseDto(), {
      overall: budget.overall
        ? DashboardBudgetLimitResponseDto.fromLimit(budget.overall)
        : null,
      categories: budget.categories.map((entry) =>
        DashboardBudgetCategoryResponseDto.fromCategory(entry, translate),
      ),
    });
  }
}

export class DashboardSpendingGuidanceResponseDto {
  @ApiProperty({
    enum: SpendingGuidanceBasis,
    description:
      'Which figure limits the amount left to spend: BUDGET when the overall limit does, BALANCE (balances.available) when the month has no overall limit or less money is available than the limit leaves.',
  })
  basis!: SpendingGuidanceBasis;

  @ApiProperty({
    example: '1000.00',
    description:
      'The lower of overall limit minus expenses.total and balances.available, which each count a commitment once. Never below 0.',
  })
  remaining!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '333.33',
    description:
      'Informational daily allowance: remaining divided by period.remainingDays, rounded down to the cent; null for a past month.',
  })
  dailyAllowance!: string | null;

  static fromDomain(
    guidance: SpendingGuidance,
  ): DashboardSpendingGuidanceResponseDto {
    return Object.assign(new DashboardSpendingGuidanceResponseDto(), {
      basis: guidance.basis,
      remaining: formatMoney(guidance.remaining),
      dailyAllowance:
        guidance.dailyAllowance === null
          ? null
          : formatMoney(guidance.dailyAllowance),
    });
  }
}

export class DashboardInvestmentResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: InvestmentType })
  type!: InvestmentType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty({ example: '6000.00' })
  currentValue!: string;

  @ApiProperty({ type: String, nullable: true, example: '10000.00' })
  targetAmount!: string | null;

  @ApiProperty({
    type: InvestmentProgressResponseDto,
    nullable: true,
    description: 'Progress toward targetAmount; null without a target.',
  })
  progress!: InvestmentProgressResponseDto | null;
}

export class DashboardContributionBreakdownResponseDto {
  @ApiProperty({ example: '700.00' })
  mandatoryPlanned!: string;

  @ApiProperty({ example: '0.00' })
  mandatoryCompleted!: string;

  @ApiProperty({ example: '600.00' })
  additionalPlanned!: string;

  @ApiProperty({ example: '0.00' })
  additionalCompleted!: string;

  @ApiProperty({ example: '0.00' })
  oneTimePlanned!: string;

  @ApiProperty({ example: '0.00' })
  oneTimeCompleted!: string;
}

export class DashboardInvestmentsResponseDto {
  @ApiProperty({
    example: '6000.00',
    description:
      'Current value of every active investment, reserve, and goal (completed contributions minus withdrawals plus valuation adjustments, any date). Not part of balances: it is money held outside the accounts.',
  })
  totalValue!: string;

  @ApiProperty({
    type: DashboardAmountsResponseDto,
    description:
      'Contributions dated inside the period: completed and planned. Never counted as expenses; planned ones already lower balances.projected.',
  })
  contributions!: DashboardAmountsResponseDto;

  @ApiProperty({
    type: DashboardAmountsResponseDto,
    description:
      'Withdrawals dated inside the period: completed and planned. Never counted as income; planned ones already raise balances.projected.',
  })
  withdrawals!: DashboardAmountsResponseDto;

  @ApiProperty({
    type: DashboardContributionBreakdownResponseDto,
    description:
      'The contributions dated inside the period by kind: mandatory (recurring), additional (accepted surplus), and one-time.',
  })
  contributionBreakdown!: DashboardContributionBreakdownResponseDto;

  @ApiProperty({
    type: [SavingPlanResponseDto],
    description:
      'Saving plans of the month, derived on read; suggestions never change any balance.',
  })
  savingPlans!: SavingPlanResponseDto[];

  @ApiProperty({
    type: [DashboardInvestmentResponseDto],
    description: 'Active investments, reserves, and goals, by name.',
  })
  items!: DashboardInvestmentResponseDto[];

  static fromDomain(
    investments: DashboardInvestments,
    translate: (key: string) => string,
  ): DashboardInvestmentsResponseDto {
    return Object.assign(new DashboardInvestmentsResponseDto(), {
      totalValue: formatMoney(investments.totalValue),
      contributions: DashboardAmountsResponseDto.fromDomain(
        investments.contributions,
      ),
      withdrawals: DashboardAmountsResponseDto.fromDomain(
        investments.withdrawals,
      ),
      contributionBreakdown: Object.assign(
        new DashboardContributionBreakdownResponseDto(),
        {
          mandatoryPlanned: formatMoney(
            investments.contributionBreakdown.mandatoryPlanned,
          ),
          mandatoryCompleted: formatMoney(
            investments.contributionBreakdown.mandatoryCompleted,
          ),
          additionalPlanned: formatMoney(
            investments.contributionBreakdown.additionalPlanned,
          ),
          additionalCompleted: formatMoney(
            investments.contributionBreakdown.additionalCompleted,
          ),
          oneTimePlanned: formatMoney(
            investments.contributionBreakdown.oneTimePlanned,
          ),
          oneTimeCompleted: formatMoney(
            investments.contributionBreakdown.oneTimeCompleted,
          ),
        },
      ),
      savingPlans: investments.savingPlans.map((plan) =>
        SavingPlanResponseDto.fromDomain(plan, translate),
      ),
      items: investments.items.map(({ investment, value }) =>
        Object.assign(new DashboardInvestmentResponseDto(), {
          uuid: investment.uuid,
          name: investment.name,
          type: investment.type,
          typeLabel: investmentTypeLabel(investment.type, translate),
          currentValue: formatMoney(value.current),
          targetAmount:
            investment.targetAmount === null
              ? null
              : formatMoney(investment.targetAmount),
          progress:
            investment.targetAmount === null
              ? null
              : InvestmentProgressResponseDto.of(
                  value.current,
                  investment.targetAmount,
                ),
        }),
      ),
    });
  }
}

export class DashboardUpcomingResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: '1500.00' })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-05' })
  date!: string;

  @ApiProperty({ description: 'The date is before today.' })
  overdue!: boolean;

  @ApiProperty({ type: TransactionAccountResponseDto })
  account!: TransactionAccountResponseDto;

  @ApiProperty({ type: TransactionAccountResponseDto, nullable: true })
  destinationAccount!: TransactionAccountResponseDto | null;

  @ApiProperty({
    type: DashboardCategoryResponseDto,
    nullable: true,
    description: 'Null for transfers.',
  })
  category!: DashboardCategoryResponseDto | null;

  static fromDomain(
    { transaction, overdue }: DashboardUpcomingItem,
    translate: (key: string) => string,
  ): DashboardUpcomingResponseDto {
    const dto = new DashboardUpcomingResponseDto();

    dto.uuid = transaction.uuid;
    dto.type = transaction.type;
    dto.typeLabel = transactionTypeLabel(transaction.type, translate);
    dto.description = transaction.description;
    dto.amount = formatMoney(transaction.amount);
    dto.date = transaction.date;
    dto.overdue = overdue;
    dto.account = TransactionAccountResponseDto.fromDomain(transaction.account);
    dto.destinationAccount = transaction.destinationAccount
      ? TransactionAccountResponseDto.fromDomain(transaction.destinationAccount)
      : null;
    dto.category = transaction.category
      ? DashboardCategoryResponseDto.fromDomain(transaction.category, translate)
      : null;

    return dto;
  }
}

export class DashboardAccountResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AccountType })
  type!: AccountType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ example: '1500.00' })
  actualBalance!: string;

  @ApiProperty({ example: '1500.00' })
  projectedBalance!: string;

  static fromDomain(
    entry: DashboardAccountBalance,
    translate: (key: string) => string,
  ): DashboardAccountResponseDto {
    const dto = new DashboardAccountResponseDto();

    dto.uuid = entry.account.uuid;
    dto.name = entry.account.name;
    dto.type = entry.account.type;
    dto.typeLabel = accountTypeLabel(entry.account.type, translate);
    dto.isDefault = entry.account.isDefault;
    dto.actualBalance = formatMoney(entry.actualBalance);
    dto.projectedBalance = formatMoney(entry.projectedBalance);

    return dto;
  }
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardPeriodResponseDto })
  period!: DashboardPeriodResponseDto;

  @ApiProperty({ enum: SpendingPerspective })
  perspective!: SpendingPerspective;

  @ApiProperty()
  perspectiveLabel!: string;

  @ApiProperty({ type: DashboardBalancesResponseDto })
  balances!: DashboardBalancesResponseDto;

  @ApiProperty({ type: [DashboardAccountResponseDto] })
  accounts!: DashboardAccountResponseDto[];

  @ApiProperty({
    type: DashboardAmountsResponseDto,
    description: 'Income dated inside the period; canceled ones never count.',
  })
  income!: DashboardAmountsResponseDto;

  @ApiProperty({
    type: DashboardAmountsResponseDto,
    description:
      'Account expenses dated inside the period plus card spending of the period in the selected perspective (completed) and planned recurring card charges of the period (pending); transfers, invoice payments, and canceled or skipped ones never count.',
  })
  expenses!: DashboardAmountsResponseDto;

  @ApiProperty({
    type: [DashboardCategoryExpensesResponseDto],
    description:
      'The same expenses grouped by category, largest total first; the totals add up to expenses.total.',
  })
  expensesByCategory!: DashboardCategoryExpensesResponseDto[];

  @ApiProperty({
    type: [DashboardUpcomingResponseDto],
    description:
      'Up to 10 pending planned transactions of any type dated up to the end of the period, overdue ones included, oldest first, whatever the status of their accounts. Not a breakdown of projected minus actual balances: transfers and items on inactive accounts are listed too.',
  })
  upcoming!: DashboardUpcomingResponseDto[];

  @ApiProperty({
    example: 7,
    description:
      'Number of pending planned transactions dated up to the end of the period.',
  })
  upcomingCount!: number;

  @ApiProperty({ type: DashboardCreditCardsResponseDto })
  creditCards!: DashboardCreditCardsResponseDto;

  @ApiProperty({
    type: DashboardBudgetResponseDto,
    nullable: true,
    description:
      'Limits of the month against its expenses in the selected perspective; null when the month has no budget.',
  })
  budget!: DashboardBudgetResponseDto | null;

  @ApiProperty({ type: DashboardInvestmentsResponseDto })
  investments!: DashboardInvestmentsResponseDto;

  @ApiProperty({ type: DashboardSpendingGuidanceResponseDto })
  spendingGuidance!: DashboardSpendingGuidanceResponseDto;

  static fromDomain(
    summary: DashboardSummary,
    translate: (key: string) => string,
  ): DashboardResponseDto {
    const dto = new DashboardResponseDto();

    dto.period = DashboardPeriodResponseDto.fromDomain(summary.period);
    dto.perspective = summary.perspective;
    dto.perspectiveLabel = spendingPerspectiveLabel(
      summary.perspective,
      translate,
    );
    dto.balances = Object.assign(new DashboardBalancesResponseDto(), {
      actual: formatMoney(summary.balances.actual),
      projected: formatMoney(summary.balances.projected),
      available: formatMoney(summary.balances.available),
    });
    dto.accounts = summary.accounts.map((entry) =>
      DashboardAccountResponseDto.fromDomain(entry, translate),
    );
    dto.income = DashboardAmountsResponseDto.fromDomain(summary.income);
    dto.expenses = DashboardAmountsResponseDto.fromDomain(summary.expenses);
    dto.expensesByCategory = summary.expensesByCategory.map((entry) =>
      DashboardCategoryExpensesResponseDto.fromCategory(entry, translate),
    );
    dto.upcoming = summary.upcoming.map((item) =>
      DashboardUpcomingResponseDto.fromDomain(item, translate),
    );
    dto.upcomingCount = summary.upcomingCount;
    dto.creditCards = DashboardCreditCardsResponseDto.fromDomain(
      summary.creditCards,
      translate,
    );
    dto.budget = summary.budget
      ? DashboardBudgetResponseDto.fromDomain(summary.budget, translate)
      : null;
    dto.investments = DashboardInvestmentsResponseDto.fromDomain(
      summary.investments,
      translate,
    );
    dto.spendingGuidance = DashboardSpendingGuidanceResponseDto.fromDomain(
      summary.spendingGuidance,
    );

    return dto;
  }
}
