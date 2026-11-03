import { ApiProperty } from '@nestjs/swagger';
import type { CreditCardInvoiceEntity } from '../../../domain/entities/credit-card-invoice.entity';

export class CreditCardInvoiceRefResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-01',
    description: 'First day of the month the invoice is due in.',
  })
  referenceMonth!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-05' })
  closingDate!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-12' })
  dueDate!: string;

  static fromDomain(
    invoice: CreditCardInvoiceEntity,
  ): CreditCardInvoiceRefResponseDto {
    return Object.assign(new CreditCardInvoiceRefResponseDto(), {
      uuid: invoice.uuid,
      referenceMonth: invoice.referenceMonth,
      closingDate: invoice.closingDate,
      dueDate: invoice.dueDate,
    });
  }
}
