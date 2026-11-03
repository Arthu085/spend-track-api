import { ApiProperty } from '@nestjs/swagger';
import { TransactionCategoryRefResponseDto } from '@modules/transactions/presentation';
import { financeToday } from '@shared/domain/calendar';
import { formatMoney } from '@shared/domain/money';
import type {
  CreditCardInstallment,
  CreditCardPurchaseEntity,
  CreditCardPurchaseRefund,
} from '../../../domain/entities/credit-card-purchase.entity';
import { CreditCardInvoiceRefResponseDto } from './credit-card-invoice-ref.response';
import { CreditCardRefResponseDto } from './credit-card.response';

export class CreditCardInstallmentResponseDto {
  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ example: '100.00' })
  amount!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-29',
    description:
      'Purchase date shifted by number − 1 months; its month in the purchase-date perspective.',
  })
  date!: string;

  @ApiProperty({ type: CreditCardInvoiceRefResponseDto })
  invoice!: CreditCardInvoiceRefResponseDto;

  static fromDomain(
    installment: CreditCardInstallment,
  ): CreditCardInstallmentResponseDto {
    return Object.assign(new CreditCardInstallmentResponseDto(), {
      number: installment.number,
      amount: formatMoney(installment.amount),
      date: installment.date,
      invoice: CreditCardInvoiceRefResponseDto.fromDomain(installment.invoice),
    });
  }
}

export class CreditCardPurchaseRefundResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ example: '50.00' })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-03' })
  date!: string;

  @ApiProperty({ type: CreditCardInvoiceRefResponseDto })
  invoice!: CreditCardInvoiceRefResponseDto;

  static fromDomain(
    refund: CreditCardPurchaseRefund,
  ): CreditCardPurchaseRefundResponseDto {
    return Object.assign(new CreditCardPurchaseRefundResponseDto(), {
      uuid: refund.uuid,
      amount: formatMoney(refund.amount),
      date: refund.date,
      invoice: CreditCardInvoiceRefResponseDto.fromDomain(refund.invoice),
    });
  }
}

export class CreditCardPurchaseResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ type: CreditCardRefResponseDto })
  card!: CreditCardRefResponseDto;

  @ApiProperty({ type: TransactionCategoryRefResponseDto })
  category!: TransactionCategoryRefResponseDto;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: '300.00', description: 'Original total.' })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-29' })
  purchaseDate!: string;

  @ApiProperty({ example: 3 })
  installmentCount!: number;

  @ApiProperty({ type: [CreditCardInstallmentResponseDto] })
  installments!: CreditCardInstallmentResponseDto[];

  @ApiProperty({ type: [CreditCardPurchaseRefundResponseDto] })
  refunds!: CreditCardPurchaseRefundResponseDto[];

  @ApiProperty({ example: '0.00' })
  refundedAmount!: string;

  @ApiProperty({
    example: '300.00',
    description: 'amount − refundedAmount: the most a new refund may credit.',
  })
  refundableAmount!: string;

  @ApiProperty({
    description:
      'true while no installment sits on a closed invoice and nothing was refunded; otherwise correct it with a refund.',
  })
  deletable!: boolean;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    purchase: CreditCardPurchaseEntity,
    translate: (key: string) => string,
  ): CreditCardPurchaseResponseDto {
    const dto = new CreditCardPurchaseResponseDto();

    dto.uuid = purchase.uuid;
    dto.card = CreditCardRefResponseDto.fromDomain(purchase.card);
    dto.category = TransactionCategoryRefResponseDto.fromDomain(
      purchase.category,
      translate,
    );
    dto.description = purchase.description;
    dto.amount = formatMoney(purchase.amount);
    dto.purchaseDate = purchase.purchaseDate;
    dto.installmentCount = purchase.installmentCount;
    dto.installments = purchase.installments.map((installment) =>
      CreditCardInstallmentResponseDto.fromDomain(installment),
    );
    dto.refunds = purchase.refunds.map((refund) =>
      CreditCardPurchaseRefundResponseDto.fromDomain(refund),
    );
    dto.refundedAmount = formatMoney(purchase.refundedAmount);
    dto.refundableAmount = formatMoney(purchase.refundableAmount);
    dto.deletable = purchase.isDeletableOn(financeToday());
    dto.notes = purchase.notes;
    dto.createdAt = purchase.createdAt;
    dto.updatedAt = purchase.updatedAt;

    return dto;
  }
}
