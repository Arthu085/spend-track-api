import { PaginatedResult } from '../paginated-result';

describe('PaginatedResult', () => {
  describe('map', () => {
    it('transforms every item and preserves the pagination metadata', () => {
      const source = PaginatedResult.of([1, 2, 3], 42, 2, 3);

      const mapped = source.map((value) => `item-${value}`);

      expect(mapped).toBeInstanceOf(PaginatedResult);
      expect(mapped.items).toEqual(['item-1', 'item-2', 'item-3']);
      expect(mapped.total).toBe(42);
      expect(mapped.page).toBe(2);
      expect(mapped.limit).toBe(3);
    });

    it('returns a new instance and leaves the source untouched', () => {
      const source = PaginatedResult.of([1, 2], 2, 1, 20);

      const mapped = source.map((value) => value * 10);

      expect(mapped).not.toBe(source);
      expect(source.items).toEqual([1, 2]);
    });

    it('maps an empty page to an empty page with the same metadata', () => {
      const mapped = PaginatedResult.of<number>([], 0, 1, 20).map(String);

      expect(mapped.items).toEqual([]);
      expect(mapped.total).toBe(0);
      expect(mapped.page).toBe(1);
      expect(mapped.limit).toBe(20);
    });
  });
});
