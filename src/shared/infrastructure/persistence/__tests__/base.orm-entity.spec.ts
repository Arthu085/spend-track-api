import { Entity } from 'typeorm';
import { BaseOrmEntity } from '../base.orm-entity';
import { RecordStatus } from '../../../domain/enums/record-status.enum';

@Entity('test_entities')
class TestOrmEntity extends BaseOrmEntity {}

describe('BaseOrmEntity', () => {
  it('exposes id, uuid, status, createdAt, updatedAt and deletedAt on subclasses', () => {
    const entity = new TestOrmEntity();
    entity.id = 1;
    entity.uuid = '11111111-1111-1111-1111-111111111111';
    entity.status = RecordStatus.ACTIVE;
    entity.createdAt = new Date('2026-01-01T00:00:00.000Z');
    entity.updatedAt = new Date('2026-01-02T00:00:00.000Z');
    entity.deletedAt = null;

    expect(entity.id).toBe(1);
    expect(entity.uuid).toBe('11111111-1111-1111-1111-111111111111');
    expect(entity.status).toBe(RecordStatus.ACTIVE);
    expect(entity.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(entity.updatedAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
    expect(entity.deletedAt).toBeNull();
  });
});
