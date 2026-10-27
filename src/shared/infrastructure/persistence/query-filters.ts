import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { normalizeTextFilter } from '../../application/filters/normalize-text-filter';

const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

function escapeLikePattern(value: string): string {
  return value.replace(LIKE_SPECIAL_CHARACTERS, '\\$&');
}

export function applyILikeFilter(
  qb: SelectQueryBuilder<ObjectLiteral>,
  column: string,
  paramName: string,
  value?: string,
): void {
  const normalized = normalizeTextFilter(value);

  if (!normalized) {
    return;
  }

  qb.andWhere(`${column} ILIKE :${paramName}`, {
    [paramName]: `%${escapeLikePattern(normalized)}%`,
  });
}

export function applyExactFilter<T>(
  qb: SelectQueryBuilder<ObjectLiteral>,
  column: string,
  paramName: string,
  value?: T,
): void {
  if (value === undefined || value === null) {
    return;
  }

  qb.andWhere(`${column} = :${paramName}`, { [paramName]: value });
}
