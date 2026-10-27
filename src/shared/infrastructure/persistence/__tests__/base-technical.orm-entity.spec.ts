import { Entity, getMetadataArgsStorage } from 'typeorm';
import { BaseTechnicalOrmEntity } from '../base-technical.orm-entity';

@Entity('test_technical_entities')
class TestTechnicalOrmEntity extends BaseTechnicalOrmEntity {}

describe('BaseTechnicalOrmEntity', () => {
  it('exposes id, uuid and createdAt on subclasses', () => {
    const entity = new TestTechnicalOrmEntity();
    entity.id = 1;
    entity.uuid = '11111111-1111-1111-1111-111111111111';
    entity.createdAt = new Date('2026-01-01T00:00:00.000Z');

    expect(entity.id).toBe(1);
    expect(entity.uuid).toBe('11111111-1111-1111-1111-111111111111');
    expect(entity.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('declares no status, updated_at or deleted_at column', () => {
    const columnNames = getMetadataArgsStorage()
      .columns.filter((column) => column.target === BaseTechnicalOrmEntity)
      .map((column) => column.options.name)
      .sort();

    expect(columnNames).toEqual(['created_at', 'id', 'uuid']);
  });
});
