import { summarizePendingOperations } from '../pending-operations';

describe('summarizePendingOperations', () => {
  it('counts the operations and adds up their exact amounts', () => {
    expect(summarizePendingOperations([5590, 5590, 1])).toEqual({
      count: 3,
      total: 11181,
    });
  });

  it('reports nothing pending for no operations', () => {
    expect(summarizePendingOperations([])).toEqual({ count: 0, total: 0 });
  });
});
