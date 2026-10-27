import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UuidFilterField } from '../uuid-filter-field.decorator';

class UuidFilterFieldTestDto {
  @UuidFilterField('Filter by role uuid (exact match).')
  role?: string;
}

describe('UuidFilterField', () => {
  it('passes validation when the field is omitted', async () => {
    const dto = plainToInstance(UuidFilterFieldTestDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes validation for a valid UUID', async () => {
    const dto = plainToInstance(UuidFilterFieldTestDto, {
      role: randomUUID(),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation for a non-UUID string', async () => {
    const dto = plainToInstance(UuidFilterFieldTestDto, {
      role: 'not-a-uuid',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('role');
    expect(errors[0].constraints).toHaveProperty('isUuid');
  });
});
