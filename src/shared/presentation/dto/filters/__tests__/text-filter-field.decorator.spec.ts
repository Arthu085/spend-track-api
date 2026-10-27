import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TextFilterField } from '../text-filter-field.decorator';

class TextFilterFieldTestDto {
  @TextFilterField()
  name?: string;

  @TextFilterField({ maxLength: 5 })
  shortName?: string;
}

describe('TextFilterField', () => {
  it('passes validation when the field is omitted', async () => {
    const dto = plainToInstance(TextFilterFieldTestDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes validation for a valid string value', async () => {
    const dto = plainToInstance(TextFilterFieldTestDto, { name: 'ali' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation for a non-string value', async () => {
    const dto = plainToInstance(TextFilterFieldTestDto, { name: 123 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('name');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('fails validation when the value exceeds the default max length', async () => {
    const dto = plainToInstance(TextFilterFieldTestDto, {
      name: 'a'.repeat(256),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('name');
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('fails validation when the value exceeds a custom max length', async () => {
    const dto = plainToInstance(TextFilterFieldTestDto, {
      shortName: 'abcdef',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('shortName');
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('passes validation when the value is within a custom max length', async () => {
    const dto = plainToInstance(TextFilterFieldTestDto, {
      shortName: 'abcde',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
