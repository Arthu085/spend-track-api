import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MoneyField } from '../money-field.decorator';

class MoneyFieldTestDto {
  @MoneyField({ example: '1500.00' })
  amount!: string;
}

async function errorsFor(amount: unknown) {
  return validate(plainToInstance(MoneyFieldTestDto, { amount }));
}

describe('MoneyField', () => {
  it.each(['0', '10', '10.5', '-10.55', '999999999999.99'])(
    'accepts %p',
    async (amount) => {
      await expect(errorsFor(amount)).resolves.toHaveLength(0);
    },
  );

  it.each(['10.555', '1,50', '', '1e3', '1000000000000'])(
    'rejects %p',
    async (amount) => {
      const errors = await errorsFor(amount);

      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('matches');
    },
  );

  // A JSON number would already have lost precision before validation.
  it('rejects a number instead of a decimal string', async () => {
    const errors = await errorsFor(10.5);

    expect(errors[0].constraints).toHaveProperty('isString');
  });
});
