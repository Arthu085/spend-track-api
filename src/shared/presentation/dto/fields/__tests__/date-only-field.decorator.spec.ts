import { DECORATORS } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DateOnlyField } from '../date-only-field.decorator';

class DateOnlyFieldTestDto {
  @DateOnlyField({ example: '2026-01-31', description: 'Reference date' })
  date!: string;
}

class OptionalDateOnlyFieldTestDto {
  @DateOnlyField({ example: '2026-01-31', required: false })
  date?: string;
}

async function errorsFor(date: unknown) {
  return validate(plainToInstance(DateOnlyFieldTestDto, { date }));
}

function swaggerMetadataOf(target: object): Record<string, unknown> {
  return Reflect.getMetadata(
    DECORATORS.API_MODEL_PROPERTIES,
    target,
    'date',
  ) as Record<string, unknown>;
}

describe('DateOnlyField', () => {
  it.each(['2026-01-31', '2024-02-29'])('accepts %p', async (date) => {
    await expect(errorsFor(date)).resolves.toHaveLength(0);
  });

  it.each(['2026-02-30', '2025-02-29', '2026-13-01'])(
    'rejects the impossible date %p',
    async (date) => {
      const errors = await errorsFor(date);

      expect(errors[0].constraints).toHaveProperty('isIso8601');
    },
  );

  it.each(['2026-1-31', '31/01/2026', '2026-01-31T00:00:00Z'])(
    'rejects %p, which is not a YYYY-MM-DD date',
    async (date) => {
      const errors = await errorsFor(date);

      expect(errors[0].constraints).toHaveProperty('matches');
    },
  );

  it.each([20260131, null, undefined, true])(
    'rejects the non-string value %p without throwing',
    async (date) => {
      const errors = await errorsFor(date);

      expect(errors[0].constraints).toHaveProperty('isString');
    },
  );

  it('documents a required date-format string in Swagger', () => {
    expect(swaggerMetadataOf(DateOnlyFieldTestDto.prototype)).toMatchObject({
      type: String,
      format: 'date',
      example: '2026-01-31',
      required: true,
      description: 'Reference date',
    });
  });

  it('documents an optional field when required is false', () => {
    expect(
      swaggerMetadataOf(OptionalDateOnlyFieldTestDto.prototype),
    ).toMatchObject({ required: false });
  });
});
