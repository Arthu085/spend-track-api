import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { CreditCardOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card.orm-entity';
import { InvestmentOrmEntity } from '@modules/investments/infrastructure/persistence/entities/investment.orm-entity';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { AdditionalContributionStrategy } from '@modules/recurrences/domain/enums/additional-contribution-strategy.enum';
import { RecurrenceFrequency } from '@modules/recurrences/domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '@modules/recurrences/domain/enums/recurrence-state.enum';
import { RecurrenceType } from '@modules/recurrences/domain/enums/recurrence-type.enum';

@Entity('recurrences')
@Check('chk_recurrences_amount_positive', `"amount" > 0`)
@Check(
  'chk_recurrences_target_kind',
  `("account_id" IS NULL) <> ("credit_card_id" IS NULL) AND ("credit_card_id" IS NULL OR "type"::text = 'EXPENSE')`,
)
@Check(
  'chk_recurrences_investment_contribution',
  `("type"::text = 'INVESTMENT_CONTRIBUTION' AND "investment_id" IS NOT NULL AND "account_id" IS NOT NULL AND "credit_card_id" IS NULL AND "category_id" IS NULL) OR ("type"::text <> 'INVESTMENT_CONTRIBUTION' AND "investment_id" IS NULL AND "category_id" IS NOT NULL)`,
)
@Check(
  'chk_recurrences_saving_strategy',
  `("minimum_retained_balance" IS NULL AND "additional_contribution_strategy" IS NULL) OR ("minimum_retained_balance" >= 0 AND "additional_contribution_strategy" IS NOT NULL AND "type"::text = 'INVESTMENT_CONTRIBUTION' AND "frequency" = 'MONTHLY')`,
)
@Check(
  'chk_recurrences_end_date',
  `"end_date" IS NULL OR "end_date" >= "start_date"`,
)
@Index('idx_recurrences_user_id', ['userId'])
@Index('idx_recurrences_account_id', ['accountId'])
@Index('idx_recurrences_credit_card_id', ['creditCardId'])
@Index('idx_recurrences_category_id', ['categoryId'])
@Index('idx_recurrences_investment_id', ['investmentId'])
export class RecurrenceOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the recurrence; only this user can read or change it.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'type',
    type: 'enum',
    enum: RecurrenceType,
    nullable: false,
    comment: 'Income, expense, or investment contribution; fixed at creation.',
  })
  type!: RecurrenceType;

  @Column({
    name: 'description',
    type: 'varchar',
    length: 150,
    nullable: false,
    comment: 'Description copied to new occurrences.',
  })
  description!: string;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment: 'Expected amount in BRL copied to new occurrences.',
  })
  amount!: string;

  @Column({
    name: 'frequency',
    type: 'enum',
    enum: RecurrenceFrequency,
    nullable: false,
    comment: 'Weekly, monthly, or yearly schedule counted from start_date.',
  })
  frequency!: RecurrenceFrequency;

  @Column({
    name: 'start_date',
    type: 'date',
    nullable: false,
    comment: 'Date of the first occurrence.',
  })
  startDate!: string;

  @Column({
    name: 'end_date',
    type: 'date',
    nullable: true,
    comment: 'Last date an occurrence may fall on; null when open-ended.',
  })
  endDate!: string | null;

  @Column({
    name: 'state',
    type: 'enum',
    enum: RecurrenceState,
    nullable: false,
    comment:
      'ACTIVE generates occurrences, PAUSED does not, ENDED was ended as a whole.',
  })
  state!: RecurrenceState;

  @Column({
    name: 'account_id',
    type: 'int',
    nullable: true,
    comment:
      'Account of the generated transactions; null for card recurrences.',
  })
  accountId!: number | null;

  @ManyToOne(() => AccountOrmEntity, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account?: AccountOrmEntity | null;

  @Column({
    name: 'credit_card_id',
    type: 'int',
    nullable: true,
    comment: 'Card of the generated charges; null for account recurrences.',
  })
  creditCardId!: number | null;

  @ManyToOne(() => CreditCardOrmEntity, { nullable: true })
  @JoinColumn({ name: 'credit_card_id' })
  creditCard?: CreditCardOrmEntity | null;

  @Column({
    name: 'category_id',
    type: 'int',
    nullable: true,
    comment:
      'Global or personal category whose kind matches the type; null for investment contributions.',
  })
  categoryId!: number | null;

  @ManyToOne(() => TransactionCategoryOrmEntity, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: TransactionCategoryOrmEntity | null;

  @Column({
    name: 'investment_id',
    type: 'int',
    nullable: true,
    comment:
      'Investment receiving the contributions; set only on investment contributions and fixed at creation.',
  })
  investmentId!: number | null;

  @ManyToOne(() => InvestmentOrmEntity, { nullable: true })
  @JoinColumn({ name: 'investment_id' })
  investment?: InvestmentOrmEntity | null;

  @Column({
    name: 'minimum_retained_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    comment:
      'Saving strategy: balance to keep in the account before suggesting additional contributions.',
  })
  minimumRetainedBalance!: string | null;

  @Column({
    name: 'additional_contribution_strategy',
    type: 'enum',
    enum: AdditionalContributionStrategy,
    nullable: true,
    comment:
      'Saving strategy: how additional contributions are suggested; null without a strategy.',
  })
  additionalContributionStrategy!: AdditionalContributionStrategy | null;

  @Column({
    name: 'notes',
    type: 'varchar',
    length: 1000,
    nullable: true,
    comment: 'Optional free-text notes.',
  })
  notes!: string | null;

  @Column({
    name: 'generated_through',
    type: 'date',
    nullable: true,
    comment:
      'Occurrences dated up to this date were generated; null before the first generation.',
  })
  generatedThrough!: string | null;
}
