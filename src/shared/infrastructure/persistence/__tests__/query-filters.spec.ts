import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { applyExactFilter, applyILikeFilter } from '../query-filters';

interface QueryBuilderMock {
  qb: SelectQueryBuilder<ObjectLiteral>;
  andWhere: jest.Mock;
}

function buildQueryBuilderMock(): QueryBuilderMock {
  const andWhere = jest.fn();

  const qb = {
    andWhere: andWhere.mockReturnThis(),
  } as unknown as SelectQueryBuilder<ObjectLiteral>;

  return { qb, andWhere };
}

describe('applyILikeFilter', () => {
  it('applies an ILIKE fragment with a wrapped %value% param when a value is given', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyILikeFilter(qb, 'user.name', 'name', 'ali');

    expect(andWhere).toHaveBeenCalledWith('user.name ILIKE :name', {
      name: '%ali%',
    });
  });

  it('trims the value before building the ILIKE fragment', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyILikeFilter(qb, 'user.name', 'name', '  ali  ');

    expect(andWhere).toHaveBeenCalledWith('user.name ILIKE :name', {
      name: '%ali%',
    });
  });

  it.each([
    ['%', '%\\%%'],
    ['_', '%\\_%'],
    ['\\', '%\\\\%'],
    ['50%_off\\', '%50\\%\\_off\\\\%'],
  ])('escapes LIKE wildcards so %p matches literally', (value, expected) => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyILikeFilter(qb, 'user.name', 'name', value);

    expect(andWhere).toHaveBeenCalledWith('user.name ILIKE :name', {
      name: expected,
    });
  });

  it('is a no-op when the value is undefined', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyILikeFilter(qb, 'user.name', 'name', undefined);

    expect(andWhere).not.toHaveBeenCalled();
  });

  it('is a no-op when the value is blank/whitespace-only', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyILikeFilter(qb, 'user.name', 'name', '   ');

    expect(andWhere).not.toHaveBeenCalled();
  });
});

describe('applyExactFilter', () => {
  it('applies an equality fragment when a value is defined', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyExactFilter(qb, 'user.status', 'status', 'ACTIVE');

    expect(andWhere).toHaveBeenCalledWith('user.status = :status', {
      status: 'ACTIVE',
    });
  });

  it('applies the fragment for a falsy-but-valid value (e.g. 0)', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyExactFilter(qb, 'user.rank', 'rank', 0);

    expect(andWhere).toHaveBeenCalledWith('user.rank = :rank', {
      rank: 0,
    });
  });

  it('applies the fragment for a falsy-but-valid value (empty string)', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyExactFilter(qb, 'user.code', 'code', '');

    expect(andWhere).toHaveBeenCalledWith('user.code = :code', {
      code: '',
    });
  });

  it('is a no-op when the value is undefined', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyExactFilter(qb, 'user.status', 'status', undefined);

    expect(andWhere).not.toHaveBeenCalled();
  });

  it('is a no-op when the value is null', () => {
    const { qb, andWhere } = buildQueryBuilderMock();

    applyExactFilter(qb, 'user.status', 'status', null);

    expect(andWhere).not.toHaveBeenCalled();
  });
});
