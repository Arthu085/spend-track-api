import { BaseTechnicalEntity } from '@shared/domain/entities/base-technical.entity';
import { isInvoiceClosed, type InvoiceCycle } from '../billing/invoice-cycle';
import type { CreditCardEntity } from './credit-card.entity';

export interface CreateCreditCardInvoiceInput extends InvoiceCycle {
  uuid: string;
  card: CreditCardEntity;
}

export interface ReconstituteCreditCardInvoiceInput extends CreateCreditCardInvoiceInput {
  id: number;
  createdAt: Date;
}

export class CreditCardInvoiceEntity
  extends BaseTechnicalEntity
  implements InvoiceCycle
{
  private constructor(
    id: number,
    uuid: string,
    createdAt: Date,
    readonly card: CreditCardEntity,
    readonly referenceMonth: string,
    readonly closingDate: string,
    readonly dueDate: string,
  ) {
    super(id, uuid, createdAt);
  }

  static create(input: CreateCreditCardInvoiceInput): CreditCardInvoiceEntity {
    return CreditCardInvoiceEntity.reconstitute({
      ...input,
      id: 0,
      createdAt: new Date(),
    });
  }

  static reconstitute(
    input: ReconstituteCreditCardInvoiceInput,
  ): CreditCardInvoiceEntity {
    return new CreditCardInvoiceEntity(
      input.id,
      input.uuid,
      input.createdAt,
      input.card,
      input.referenceMonth,
      input.closingDate,
      input.dueDate,
    );
  }

  get ownerId(): number {
    return this.card.ownerId;
  }

  isClosedOn(today: string): boolean {
    return isInvoiceClosed(this, today);
  }
}
