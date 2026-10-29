import { TransactionCategoryKind } from '../enums/transaction-category-kind.enum';

export interface GlobalTransactionCategoryDefinition {
  code: string;
  kind: TransactionCategoryKind;
  name: string;
  color: string;
}

export const GLOBAL_TRANSACTION_CATEGORIES: readonly GlobalTransactionCategoryDefinition[] =
  [
    {
      code: 'FOOD',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Food',
      color: '#E8590C',
    },
    {
      code: 'GROCERIES',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Groceries',
      color: '#2F9E44',
    },
    {
      code: 'HOUSING',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Housing',
      color: '#1971C2',
    },
    {
      code: 'TRANSPORT',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Transport',
      color: '#F08C00',
    },
    {
      code: 'HEALTH',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Health',
      color: '#C2255C',
    },
    {
      code: 'EDUCATION',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Education',
      color: '#5F3DC4',
    },
    {
      code: 'ENTERTAINMENT',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Entertainment',
      color: '#9C36B5',
    },
    {
      code: 'GIFTS',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Gifts',
      color: '#D6336C',
    },
    {
      code: 'SHOPPING',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Shopping',
      color: '#0C8599',
    },
    {
      code: 'SUBSCRIPTIONS',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Subscriptions',
      color: '#3B5BDB',
    },
    {
      code: 'OTHER_EXPENSE',
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Other expenses',
      color: '#868E96',
    },
    {
      code: 'SALARY',
      kind: TransactionCategoryKind.INCOME,
      name: 'Salary',
      color: '#2B8A3E',
    },
    {
      code: 'FREELANCE',
      kind: TransactionCategoryKind.INCOME,
      name: 'Freelance',
      color: '#087F5B',
    },
    {
      code: 'INVESTMENT_INCOME',
      kind: TransactionCategoryKind.INCOME,
      name: 'Investment income',
      color: '#1864AB',
    },
    {
      code: 'GIFTS_RECEIVED',
      kind: TransactionCategoryKind.INCOME,
      name: 'Gifts received',
      color: '#A61E4D',
    },
    {
      code: 'OTHER_INCOME',
      kind: TransactionCategoryKind.INCOME,
      name: 'Other income',
      color: '#495057',
    },
  ];
