import { deleteInBatches } from '../delete-in-batches';

describe('deleteInBatches', () => {
  it('stops after a single partial batch', async () => {
    const deleteBatch = jest.fn().mockResolvedValueOnce(3);

    await expect(deleteInBatches(deleteBatch, 10)).resolves.toBe(3);
    expect(deleteBatch).toHaveBeenCalledTimes(1);
    expect(deleteBatch).toHaveBeenCalledWith(10);
  });

  it('keeps deleting while batches come back full and sums every batch', async () => {
    const deleteBatch = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4);

    await expect(deleteInBatches(deleteBatch, 10)).resolves.toBe(24);
    expect(deleteBatch).toHaveBeenCalledTimes(3);
  });

  it('runs one extra empty batch when the backlog is an exact multiple of the batch size', async () => {
    const deleteBatch = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0);

    await expect(deleteInBatches(deleteBatch, 10)).resolves.toBe(10);
    expect(deleteBatch).toHaveBeenCalledTimes(2);
  });

  it('returns 0 when nothing matches', async () => {
    const deleteBatch = jest.fn().mockResolvedValue(0);

    await expect(deleteInBatches(deleteBatch, 10)).resolves.toBe(0);
    expect(deleteBatch).toHaveBeenCalledTimes(1);
  });

  it('propagates a batch failure', async () => {
    const deleteBatch = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockRejectedValueOnce(new Error('db down'));

    await expect(deleteInBatches(deleteBatch, 10)).rejects.toThrow('db down');
  });
});
