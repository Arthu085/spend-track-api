import { ApiProperty } from '@nestjs/swagger';
import { TransactionAccountResponseDto } from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import type { CreditCardPaymentEntity } from '../../../domain/entities/credit-card-payment.entity';
import { CreditCardInvoiceRefResponseDto } from './credit-card-invoice-ref.response';

export class CreditCardPaymentResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ type: CreditCardInvoiceRefResponseDto })
  invoice!: CreditCardInvoiceRefResponseDto;

  @ApiProperty({ type: TransactionAccountResponseDto })
  account!: TransactionAccountResponseDto;

  @ApiProperty({ example: '1200.00' })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-10' })
  paidOn!: string;

  @ApiProperty({
    type: Date,
    nullable: true,
    example: null,
    description:
      'Set when canceled; a canceled payment affects neither the account nor the invoice.',
  })
  canceledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(
    payment: CreditCardPaymentEntity,
  ): CreditCardPaymentResponseDto {
    return Object.assign(new CreditCardPaymentResponseDto(), {
      uuid: payment.uuid,
      invoice: CreditCardInvoiceRefResponseDto.fromDomain(payment.invoice),
      account: TransactionAccountResponseDto.fromDomain(payment.account),
      amount: formatMoney(payment.amount),
      paidOn: payment.paidOn,
      canceledAt: payment.canceledAt,
      createdAt: payment.createdAt,
    });
  }
}
