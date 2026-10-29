import { CategoryKind } from '../../enums/category-kind.enum';
import { GLOBAL_CATEGORIES } from '../global-categories';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function globalNames(locale: string): Record<string, unknown> {
  const file = join(
    __dirname,
    '../../../../../i18n',
    locale,
    'categories.json',
  );

  const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
    global: Record<string, unknown>;
  };

  return parsed.global;
}

describe('GLOBAL_CATEGORIES', () => {
  it('has unique codes', () => {
    const codes = GLOBAL_CATEGORIES.map((category) => category.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('offers both expense and income categories', () => {
    const kinds = new Set(GLOBAL_CATEGORIES.map((category) => category.kind));

    expect(kinds).toEqual(new Set([CategoryKind.EXPENSE, CategoryKind.INCOME]));
  });

  it('has a translated name for every category in both languages', () => {
    for (const locale of ['en', 'pt-BR']) {
      const names = globalNames(locale);

      for (const { code } of GLOBAL_CATEGORIES) {
        expect(names[code.toLowerCase()]).toEqual(expect.any(String));
      }
    }
  });
});
