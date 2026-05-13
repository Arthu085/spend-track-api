import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import dayjs from 'dayjs';

interface IBaseFilter {
  status?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  page?: number;
  limit?: number;
}

export class QueryBuilderHelper {
  static applyBaseFilters<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    filters: IBaseFilter,
  ) {
    const { status, createdAtFrom, createdAtTo } = filters;

    if (status) {
      qb.andWhere(`${alias}.status = :status`, { status });
    }

    if (createdAtFrom) {
      qb.andWhere(`${alias}.createdAt >= :createdAtFrom`, {
        createdAtFrom: dayjs(createdAtFrom).startOf('day').toDate(),
      });
    }

    if (createdAtTo) {
      qb.andWhere(`${alias}.createdAt <= :createdAtTo`, {
        createdAtTo: dayjs(createdAtTo).endOf('day').toDate(),
      });
    }

    return qb;
  }

  static applyPagination<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    page = 1,
    limit = 10,
  ) {
    qb.skip((page - 1) * limit).take(limit);
    return qb;
  }

  static applyDefaultOrder<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
  ) {
    qb.orderBy(`${alias}.createdAt`, 'DESC');
    return qb;
  }
}
