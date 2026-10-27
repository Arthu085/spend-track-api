export async function deleteInBatches(
  deleteBatch: (limit: number) => Promise<number>,
  batchSize: number,
): Promise<number> {
  let totalDeleted = 0;
  let deleted: number;

  do {
    deleted = await deleteBatch(batchSize);
    totalDeleted += deleted;
  } while (deleted === batchSize);

  return totalDeleted;
}
