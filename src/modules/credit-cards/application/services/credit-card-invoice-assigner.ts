import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { shiftMonth, type MonthRef } from '@shared/domain/calendar';
import {
  invoiceCycleOf,
  invoiceReferenceFor,
} from '../../domain/billing/invoice-cycle';
import { CreditCardInvoiceEntity } from '../../domain/entities/credit-card-invoice.entity';
import type { CreditCardEntity } from '../../domain/entities/credit-card.entity';
import {
  CREDIT_CARD_INVOICE_REPOSITORY,
  type CreditCardInvoiceRepository,
} from '../../domain/repositories/credit-card-invoice.repository';

@Injectable()
export class CreditCardInvoiceAssigner {
  constructor(
    @Inject(CREDIT_CARD_INVOICE_REPOSITORY)
    private readonly invoiceRepository: CreditCardInvoiceRepository,
  ) {}

  async invoicesFrom(
    card: CreditCardEntity,
    date: string,
    count: number,
  ): Promise<CreditCardInvoiceEntity[]> {
    let reference = invoiceReferenceFor(card, date);
    let first = await this.findOrCreate(card, reference);

    while (first.closingDate <= date) {
      reference = shiftMonth(reference, 1);
      first = await this.findOrCreate(card, reference);
    }

    const invoices = [first];

    for (let offset = 1; offset < count; offset += 1) {
      invoices.push(
        await this.findOrCreate(card, shiftMonth(reference, offset)),
      );
    }

    return invoices;
  }

  private async findOrCreate(
    card: CreditCardEntity,
    reference: MonthRef,
  ): Promise<CreditCardInvoiceEntity> {
    const cycle = invoiceCycleOf(card, reference);

    const existing = await this.invoiceRepository.findByCardAndReferenceMonth(
      card.id,
      cycle.referenceMonth,
    );

    return (
      existing ??
      this.invoiceRepository.create(
        CreditCardInvoiceEntity.create({ ...cycle, uuid: randomUUID(), card }),
      )
    );
  }
}
