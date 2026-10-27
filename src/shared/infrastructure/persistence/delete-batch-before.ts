import type { ObjectLiteral, Repository } from 'typeorm';

export async function deleteBatchBefore<Entity extends ObjectLiteral>(
  repository: Repository<Entity>,
  column: string,
  cutoff: Date,
  limit: number,
): Promise<number> {
  const { tableName } = repository.metadata;

  const result = await repository
    .createQueryBuilder()
    .delete()
    .where(
      `id IN (
        SELECT id
        FROM "${tableName}"
        WHERE "${column}" < :cutoff
        ORDER BY id
        LIMIT :limit
        FOR UPDATE SKIP LOCKED
      )`,
      { cutoff, limit },
    )
    .execute();

  return result.affected ?? 0;
}
