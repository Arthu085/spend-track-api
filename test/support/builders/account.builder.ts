import {
  AccountEntity,
  type ReconstituteAccountInput,
} from '@modules/accounts/domain/entities/account.entity';
import { AccountType } from '@modules/accounts/domain/enums/account-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export function buildAccount(
  overrides: Partial<ReconstituteAccountInput> = {},
): AccountEntity {
  return AccountEntity.reconstitute({
    id: 1,
    uuid: 'account-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    name: 'Checking',
    type: AccountType.CHECKING,
    openingBalance: 100000,
    openingBalanceDate: '2026-01-01',
    isDefault: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}
