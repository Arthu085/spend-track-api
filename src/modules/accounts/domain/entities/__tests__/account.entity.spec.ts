import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AccountType } from '../../enums/account-type.enum';
import { AccountEntity } from '../account.entity';

function buildAccount(isDefault = true): AccountEntity {
  return AccountEntity.create({
    uuid: 'account-uuid',
    ownerId: 1,
    name: 'Wallet',
    type: AccountType.CASH,
    openingBalance: 12345,
    openingBalanceDate: '2026-10-01',
    isDefault,
  });
}

describe('AccountEntity', () => {
  it('creates an active account whose current balance is its opening balance', () => {
    const account = buildAccount();

    expect(account.id).toBe(0);
    expect(account.status).toBe(RecordStatus.ACTIVE);
    expect(account.currentBalance).toBe(12345);
  });

  it('drops the default flag when archived', () => {
    const archived = buildAccount().withStatus(RecordStatus.INACTIVE);

    expect(archived.status).toBe(RecordStatus.INACTIVE);
    expect(archived.isDefault).toBe(false);
  });

  it('does not make an account default when it is reactivated', () => {
    const restored = buildAccount(false)
      .withStatus(RecordStatus.INACTIVE)
      .withStatus(RecordStatus.ACTIVE);

    expect(restored.isDefault).toBe(false);
  });

  it('replaces the editable details and keeps ownership', () => {
    const updated = buildAccount().withDetails({
      name: 'Bank',
      type: AccountType.CHECKING,
      openingBalance: -500,
      openingBalanceDate: '2026-09-30',
    });

    expect(updated).toMatchObject({
      ownerId: 1,
      uuid: 'account-uuid',
      name: 'Bank',
      type: AccountType.CHECKING,
      openingBalance: -500,
      openingBalanceDate: '2026-09-30',
      isDefault: true,
    });
  });
});
