import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { InvestmentType } from '../enums/investment-type.enum';

export interface InvestmentDetails {
  name: string;
  type: InvestmentType;
  targetAmount: number | null;
}

export interface CreateInvestmentInput extends InvestmentDetails {
  uuid: string;
  ownerId: number;
}

export interface ReconstituteInvestmentInput extends CreateInvestmentInput {
  id: number;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class InvestmentEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly name: string,
    readonly type: InvestmentType,
    readonly targetAmount: number | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateInvestmentInput): InvestmentEntity {
    const now = new Date();

    return InvestmentEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(input: ReconstituteInvestmentInput): InvestmentEntity {
    return new InvestmentEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.name,
      input.type,
      input.targetAmount,
    );
  }

  withDetails(details: InvestmentDetails): InvestmentEntity {
    return this.copyWith(details);
  }

  withStatus(status: RecordStatus): InvestmentEntity {
    return this.copyWith({ status });
  }

  private copyWith(
    changes: Partial<
      Pick<ReconstituteInvestmentInput, keyof InvestmentDetails | 'status'>
    >,
  ): InvestmentEntity {
    return InvestmentEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      name: this.name,
      type: this.type,
      targetAmount: this.targetAmount,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
