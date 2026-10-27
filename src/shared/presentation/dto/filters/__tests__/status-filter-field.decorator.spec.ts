import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { StatusFilterField } from '../status-filter-field.decorator';

class StatusFilterFieldTestDto {
  @StatusFilterField()
  status?: RecordStatus;
}

describe('StatusFilterField', () => {
  it('passes validation when the field is omitted', async () => {
    const dto = plainToInstance(StatusFilterFieldTestDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes validation for a valid RecordStatus value', async () => {
    const dto = plainToInstance(StatusFilterFieldTestDto, {
      status: RecordStatus.ACTIVE,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation for a value outside the RecordStatus enum', async () => {
    const dto = plainToInstance(StatusFilterFieldTestDto, {
      status: 'BOGUS',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });
});
