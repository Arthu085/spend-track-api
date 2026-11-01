import { Inject, Injectable } from '@nestjs/common';
import type { InvoiceStatement } from '../../domain/billing/invoice-statement';
import {
  CREDIT_CARD_INVOICE_REPOSITORY,
  type CreditCardInvoiceRepository,
  type InvoiceEntries,
} from '../../domain/repositories/credit-card-invoice.repository';
import { findOwnedInvoice } from '../services/credit-card-references';
import { CreditCardStatements } from '../services/credit-card-statements';

export interface CreditCardInvoiceDetail {
  statement: InvoiceStatement;
  entries: InvoiceEntries;
}

@Injectable()
export class GetCreditCardInvoiceUseCase {
  constructor(
    @Inject(CREDIT_CARD_INVOICE_REPOSITORY)
    private readonly invoiceRepository: CreditCardInvoiceRepository,
    private readonly statements: CreditCardStatements,
  ) {}

  async execute(
    uuid: string,
    ownerId: number,
  ): Promise<CreditCardInvoiceDetail> {
    const invoice = await findOwnedInvoice(
      this.invoiceRepository,
      uuid,
      ownerId,
    );

    return {
      statement: await this.statements.ofInvoice(invoice),
      entries: await this.invoiceRepository.findEntries(invoice),
    };
  }
}
