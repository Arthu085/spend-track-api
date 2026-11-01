import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import type { CreditCardWithBalance } from '../../../application/services/credit-card-statements';
import type { CreditCardEntity } from '../../../domain/entities/credit-card.entity';

export class CreditCardRefResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  static fromDomain(card: CreditCardEntity): CreditCardRefResponseDto {
    return Object.assign(new CreditCardRefResponseDto(), {
      uuid: card.uuid,
      name: card.name,
      status: card.status,
    });
  }
}

export class CreditCardResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: '5000.00', description: 'Decimal string in BRL.' })
  creditLimit!: string;

  @ApiProperty({ minimum: 1, maximum: 31, example: 5 })
  closingDay!: number;

  @ApiProperty({ minimum: 1, maximum: 31, example: 12 })
  dueDay!: number;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({
    example: '1200.00',
    description:
      'Unpaid amount of every invoice of the card, future installments included.',
  })
  outstanding!: string;

  @ApiProperty({
    example: '3800.00',
    description:
      'creditLimit minus outstanding plus creditBalance; negative when over the limit.',
  })
  availableLimit!: string;

  @ApiProperty({
    example: '0.00',
    description:
      'Credit left over after the latest invoice (refunds or payments above its amount).',
  })
  creditBalance!: string;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    { card, balance }: CreditCardWithBalance,
    translate: (key: string) => string,
  ): CreditCardResponseDto {
    const dto = new CreditCardResponseDto();

    dto.uuid = card.uuid;
    dto.name = card.name;
    dto.creditLimit = formatMoney(card.creditLimit);
    dto.closingDay = card.closingDay;
    dto.dueDay = card.dueDay;
    dto.isDefault = card.isDefault;
    dto.outstanding = formatMoney(balance.outstanding);
    dto.availableLimit = formatMoney(
      card.creditLimit - balance.outstanding + balance.creditBalance,
    );
    dto.creditBalance = formatMoney(balance.creditBalance);
    dto.status = card.status;
    dto.statusLabel = translateOrFallback(
      translate,
      `enums.record_status.${card.status.toLowerCase()}`,
      card.status,
    );
    dto.createdAt = card.createdAt;
    dto.updatedAt = card.updatedAt;

    return dto;
  }
}
