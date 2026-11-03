import { ApiProperty } from '@nestjs/swagger';
import { formatMoney } from '@shared/domain/money';
import type { CreditCardRefundEntity } from '../../../domain/entities/credit-card-refund.entity';
import { CreditCardInvoiceRefResponseDto } from './credit-card-invoice-ref.response';

export class CreditCardRefundPurchaseResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  description!: string;
}

export class CreditCardRefundResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ type: CreditCardRefundPurchaseResponseDto })
  purchase!: CreditCardRefundPurchaseResponseDto;

  @ApiProperty({
    type: CreditCardInvoiceRefResponseDto,
    description: 'Invoice the refund is credited on, chosen by its date.',
  })
  invoice!: CreditCardInvoiceRefResponseDto;

  @ApiProperty({ example: '50.00' })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-03' })
  date!: string;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(
    refund: CreditCardRefundEntity,
  ): CreditCardRefundResponseDto {
    return Object.assign(new CreditCardRefundResponseDto(), {
      uuid: refund.uuid,
      purchase: Object.assign(new CreditCardRefundPurchaseResponseDto(), {
        uuid: refund.purchase.uuid,
        description: refund.purchase.description,
      }),
      invoice: CreditCardInvoiceRefResponseDto.fromDomain(refund.invoice),
      amount: formatMoney(refund.amount),
      date: refund.date,
      notes: refund.notes,
      createdAt: refund.createdAt,
    });
  }
}
