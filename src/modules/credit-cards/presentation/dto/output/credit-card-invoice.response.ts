import { ApiProperty } from '@nestjs/swagger';
import { TransactionCategoryRefResponseDto } from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import type { CreditCardInvoiceDetail } from '../../../application/use-cases/get-credit-card-invoice.use-case';
import type { InvoiceStatement } from '../../../domain/billing/invoice-statement';
import { CreditCardInvoiceStatus } from '../../../domain/enums/credit-card-invoice-status.enum';
import type { InvoiceCharge } from '../../../domain/repositories/credit-card-invoice.repository';
import { CreditCardInvoiceRefResponseDto } from './credit-card-invoice-ref.response';
import { CreditCardPaymentResponseDto } from './credit-card-payment.response';
import { CreditCardRefundResponseDto } from './credit-card-refund.response';
import { CreditCardRefResponseDto } from './credit-card.response';

export function creditCardInvoiceStatusLabel(
  status: CreditCardInvoiceStatus,
  translate: (key: string) => string,
): string {
  return translateOrFallback(
    translate,
    `credit_cards.invoice_status.${status.toLowerCase()}`,
    status,
  );
}

export class CreditCardInvoiceListResponseDto extends CreditCardInvoiceRefResponseDto {
  @ApiProperty({ type: CreditCardRefResponseDto })
  card!: CreditCardRefResponseDto;

  @ApiProperty({ example: '1500.00', description: 'Installments billed.' })
  charges!: string;

  @ApiProperty({ example: '50.00', description: 'Refunds credited.' })
  refunds!: string;

  @ApiProperty({
    example: '0.00',
    description: 'Credit carried over from the previous invoice of the card.',
  })
  previousCredit!: string;

  @ApiProperty({
    example: '1450.00',
    description: 'charges − refunds − previousCredit; negative when in credit.',
  })
  total!: string;

  @ApiProperty({ example: '1000.00', description: 'Payments not canceled.' })
  paid!: string;

  @ApiProperty({ example: '450.00', description: 'max(total − paid, 0).' })
  outstanding!: string;

  @ApiProperty({
    example: '0.00',
    description: 'Credit carried to the next invoice: max(paid − total, 0).',
  })
  creditCarried!: string;

  @ApiProperty({
    enum: CreditCardInvoiceStatus,
    description:
      'OPEN until the closing date; then PAID when nothing is outstanding, OVERDUE after the due date, CLOSED otherwise.',
  })
  status!: CreditCardInvoiceStatus;

  @ApiProperty()
  statusLabel!: string;

  protected static assignBase(
    dto: CreditCardInvoiceListResponseDto,
    statement: InvoiceStatement,
    translate: (key: string) => string,
  ): void {
    Object.assign(
      dto,
      CreditCardInvoiceRefResponseDto.fromDomain(statement.invoice),
    );

    dto.card = CreditCardRefResponseDto.fromDomain(statement.invoice.card);
    dto.charges = formatMoney(statement.charges);
    dto.refunds = formatMoney(statement.credits);
    dto.previousCredit = formatMoney(statement.previousCredit);
    dto.total = formatMoney(statement.total);
    dto.paid = formatMoney(statement.paid);
    dto.outstanding = formatMoney(statement.outstanding);
    dto.creditCarried = formatMoney(statement.creditCarried);
    dto.status = statement.status;
    dto.statusLabel = creditCardInvoiceStatusLabel(statement.status, translate);
  }

  static fromStatement(
    statement: InvoiceStatement,
    translate: (key: string) => string,
  ): CreditCardInvoiceListResponseDto {
    const dto = new CreditCardInvoiceListResponseDto();

    this.assignBase(dto, statement, translate);

    return dto;
  }
}

export class CreditCardInvoiceChargeResponseDto {
  @ApiProperty()
  purchaseUuid!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: TransactionCategoryRefResponseDto })
  category!: TransactionCategoryRefResponseDto;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-29' })
  purchaseDate!: string;

  @ApiProperty({ example: 2 })
  installmentNumber!: number;

  @ApiProperty({ example: 3 })
  installmentCount!: number;

  @ApiProperty({ example: '100.00' })
  amount!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-29',
    description: 'Month of this installment in the purchase-date perspective.',
  })
  date!: string;

  static fromDomain(
    charge: InvoiceCharge,
    translate: (key: string) => string,
  ): CreditCardInvoiceChargeResponseDto {
    return Object.assign(new CreditCardInvoiceChargeResponseDto(), {
      ...charge,
      category: TransactionCategoryRefResponseDto.fromDomain(
        charge.category,
        translate,
      ),
      amount: formatMoney(charge.amount),
    });
  }
}

export class CreditCardInvoiceDetailResponseDto extends CreditCardInvoiceListResponseDto {
  @ApiProperty({ type: [CreditCardInvoiceChargeResponseDto] })
  chargeEntries!: CreditCardInvoiceChargeResponseDto[];

  @ApiProperty({ type: [CreditCardRefundResponseDto] })
  refundEntries!: CreditCardRefundResponseDto[];

  @ApiProperty({
    type: [CreditCardPaymentResponseDto],
    description: 'Every payment, canceled ones included as history.',
  })
  payments!: CreditCardPaymentResponseDto[];

  static fromDetail(
    { statement, entries }: CreditCardInvoiceDetail,
    translate: (key: string) => string,
  ): CreditCardInvoiceDetailResponseDto {
    const dto = new CreditCardInvoiceDetailResponseDto();

    this.assignBase(dto, statement, translate);
    dto.chargeEntries = entries.charges.map((charge) =>
      CreditCardInvoiceChargeResponseDto.fromDomain(charge, translate),
    );
    dto.refundEntries = entries.refunds.map((refund) =>
      CreditCardRefundResponseDto.fromDomain(refund),
    );
    dto.payments = entries.payments.map((payment) =>
      CreditCardPaymentResponseDto.fromDomain(payment),
    );

    return dto;
  }
}
