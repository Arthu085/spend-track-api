import { CategoryKind } from '../enums/category-kind.enum';

export interface GlobalCategoryDefinition {
  code: string;
  kind: CategoryKind;
  name: string;
  color: string;
}

export const GLOBAL_CATEGORIES: readonly GlobalCategoryDefinition[] = [
  { code: 'FOOD', kind: CategoryKind.EXPENSE, name: 'Food', color: '#E8590C' },
  {
    code: 'GROCERIES',
    kind: CategoryKind.EXPENSE,
    name: 'Groceries',
    color: '#2F9E44',
  },
  {
    code: 'HOUSING',
    kind: CategoryKind.EXPENSE,
    name: 'Housing',
    color: '#1971C2',
  },
  {
    code: 'TRANSPORT',
    kind: CategoryKind.EXPENSE,
    name: 'Transport',
    color: '#F08C00',
  },
  {
    code: 'HEALTH',
    kind: CategoryKind.EXPENSE,
    name: 'Health',
    color: '#C2255C',
  },
  {
    code: 'EDUCATION',
    kind: CategoryKind.EXPENSE,
    name: 'Education',
    color: '#5F3DC4',
  },
  {
    code: 'ENTERTAINMENT',
    kind: CategoryKind.EXPENSE,
    name: 'Entertainment',
    color: '#9C36B5',
  },
  {
    code: 'GIFTS',
    kind: CategoryKind.EXPENSE,
    name: 'Gifts',
    color: '#D6336C',
  },
  {
    code: 'SHOPPING',
    kind: CategoryKind.EXPENSE,
    name: 'Shopping',
    color: '#0C8599',
  },
  {
    code: 'SUBSCRIPTIONS',
    kind: CategoryKind.EXPENSE,
    name: 'Subscriptions',
    color: '#3B5BDB',
  },
  {
    code: 'OTHER_EXPENSE',
    kind: CategoryKind.EXPENSE,
    name: 'Other expenses',
    color: '#868E96',
  },
  {
    code: 'SALARY',
    kind: CategoryKind.INCOME,
    name: 'Salary',
    color: '#2B8A3E',
  },
  {
    code: 'FREELANCE',
    kind: CategoryKind.INCOME,
    name: 'Freelance',
    color: '#087F5B',
  },
  {
    code: 'INVESTMENT_INCOME',
    kind: CategoryKind.INCOME,
    name: 'Investment income',
    color: '#1864AB',
  },
  {
    code: 'GIFTS_RECEIVED',
    kind: CategoryKind.INCOME,
    name: 'Gifts received',
    color: '#A61E4D',
  },
  {
    code: 'OTHER_INCOME',
    kind: CategoryKind.INCOME,
    name: 'Other income',
    color: '#495057',
  },
];
