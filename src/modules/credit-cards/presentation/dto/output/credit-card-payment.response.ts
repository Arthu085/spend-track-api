import { ApiProperty } from '@nestjs/swagger';
import { TransactionAccountResponseDto } from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import type { CreditCardPaymentEntity } from '../../../domain/entities/credit-card-payment.entity';
import { CreditCardPaymentSource } from '../../../domain/enums/credit-card-payment-source.enum';
import { CreditCardInvoiceRefResponseDto } from './credit-card-invoice-ref.response';

function paymentSourceLabel(
  source: CreditCardPaymentSource,
  translate: (key: string) => string,
): string {
  return translateOrFallback(
    translate,
    `credit_cards.payment_source.${source.toLowerCase()}`,
    source,
  );
}

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
    enum: CreditCardPaymentSource,
    description:
      'ACCOUNT moved money out of the account. HISTORICAL_SETTLEMENT happened before the opening date of the account, is already included in its opening balance, and never changes its balance.',
  })
  source!: CreditCardPaymentSource;

  @ApiProperty()
  sourceLabel!: string;

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
    translate: (key: string) => string,
  ): CreditCardPaymentResponseDto {
    return Object.assign(new CreditCardPaymentResponseDto(), {
      uuid: payment.uuid,
      invoice: CreditCardInvoiceRefResponseDto.fromDomain(payment.invoice),
      account: TransactionAccountResponseDto.fromDomain(payment.account),
      amount: formatMoney(payment.amount),
      paidOn: payment.paidOn,
      source: payment.source,
      sourceLabel: paymentSourceLabel(payment.source, translate),
      canceledAt: payment.canceledAt,
      createdAt: payment.createdAt,
    });
  }
}
