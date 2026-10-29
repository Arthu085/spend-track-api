import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { AccountType } from '../../../../domain/enums/account-type.enum';
import { AccountOrmEntity } from '../../entities/account.orm-entity';
import { AccountMapper } from '../account.mapper';

describe('AccountMapper', () => {
  it('maps a row to a domain account with the balance in cents', () => {
    const orm = Object.assign(new AccountOrmEntity(), {
      id: 3,
      uuid: 'account-uuid',
      status: RecordStatus.ACTIVE,
      userId: 9,
      name: 'Bank',
      type: AccountType.SAVINGS,
      openingBalance: '-1234.50',
      openingBalanceDate: '2026-10-01',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    expect(AccountMapper.toDomain(orm)).toMatchObject({
      id: 3,
      ownerId: 9,
      openingBalance: -123450,
      openingBalanceDate: '2026-10-01',
      isDefault: true,
    });
  });

  it('maps a domain account to a row with a decimal balance', () => {
    const orm = AccountMapper.toOrm(
      buildAccount({ id: 3, ownerId: 9, openingBalance: 5 }),
    );

    expect(orm).toMatchObject({
      id: 3,
      userId: 9,
      openingBalance: '0.05',
    });
  });

  it('leaves id and updatedAt unset for a new account', () => {
    const orm = AccountMapper.toOrm(buildAccount({ id: 0 }));

    expect(orm.id).toBeUndefined();
    expect(orm.updatedAt).toBeUndefined();
  });
});
