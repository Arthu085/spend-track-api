import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import { AccountEntity } from '../../../domain/entities/account.entity';
import { AccountType } from '../../../domain/enums/account-type.enum';

export function accountTypeLabel(
  type: AccountType,
  translate: (key: string) => string,
): string {
  return translateOrFallback(
    translate,
    `accounts.type.${type.toLowerCase()}`,
    type,
  );
}

export class AccountResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AccountType })
  type!: AccountType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty({ example: '1500.00', description: 'Decimal string in BRL.' })
  openingBalance!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  openingBalanceDate!: string;

  @ApiProperty({
    example: '1500.00',
    description:
      'Actual balance in BRL from completed operations, as a decimal string.',
  })
  currentBalance!: string;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    account: AccountEntity,
    translate: (key: string) => string,
  ): AccountResponseDto {
    const dto = new AccountResponseDto();

    dto.uuid = account.uuid;
    dto.name = account.name;
    dto.type = account.type;
    dto.typeLabel = accountTypeLabel(account.type, translate);
    dto.openingBalance = formatMoney(account.openingBalance);
    dto.openingBalanceDate = account.openingBalanceDate;
    dto.currentBalance = formatMoney(account.currentBalance);
    dto.isDefault = account.isDefault;
    dto.status = account.status;
    dto.statusLabel = translateOrFallback(
      translate,
      `enums.record_status.${account.status.toLowerCase()}`,
      account.status,
    );
    dto.createdAt = account.createdAt;
    dto.updatedAt = account.updatedAt;

    return dto;
  }
}
