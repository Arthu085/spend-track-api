import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from '../pagination-query.dto';

describe('PaginationQueryDto', () => {
  it('defaults to page 1 and limit 20 when no query params are provided', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('coerces string query values into numbers', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '2', limit: '50' });

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(typeof dto.page).toBe('number');
    expect(typeof dto.limit).toBe('number');
  });

  it('rejects a page below the minimum', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: 0 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('rejects a limit above the maximum', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 101 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
    expect(errors[0].constraints).toHaveProperty('max');
  });

  it('rejects a non-integer value', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: 1.5 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('computes the offset from page and limit', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: 3, limit: 10 });

    expect(dto.offset).toBe(20);
  });

  it('computes the offset from the defaults', () => {
    const dto = plainToInstance(PaginationQueryDto, {});

    expect(dto.offset).toBe(0);
  });
});
