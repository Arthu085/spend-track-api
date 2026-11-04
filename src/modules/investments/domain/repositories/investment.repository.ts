import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { InvestmentEntity } from '../entities/investment.entity';
import { InvestmentType } from '../enums/investment-type.enum';

export const INVESTMENT_REPOSITORY = Symbol('INVESTMENT_REPOSITORY');

export interface PaginatedInvestments {
  items: InvestmentEntity[];
  total: number;
}

export interface InvestmentListFilters {
  name?: string;
  type?: InvestmentType;
  status?: RecordStatus;
}

export interface InvestmentRepository {
  findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters?: InvestmentListFilters,
  ): Promise<PaginatedInvestments>;
  findAllByOwner(
    ownerId: number,
    filters?: InvestmentListFilters,
  ): Promise<InvestmentEntity[]>;
  findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<InvestmentEntity | null>;
  lockOwnerInvestments(ownerId: number): Promise<void>;
  create(investment: InvestmentEntity): Promise<InvestmentEntity>;
  update(investment: InvestmentEntity): Promise<InvestmentEntity>;
  softDelete(investment: InvestmentEntity): Promise<void>;
}
