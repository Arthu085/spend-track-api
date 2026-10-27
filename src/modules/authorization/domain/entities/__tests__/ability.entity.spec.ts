import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AbilityEntity } from '../ability.entity';

describe('AbilityEntity', () => {
  it('reconstitutes an ability from persisted fields', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');

    const ability = AbilityEntity.reconstitute({
      id: 5,
      uuid: 'ability-uuid',
      status: RecordStatus.ACTIVE,
      action: Action.READ,
      subject: Subject.USER,
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    expect(ability.id).toBe(5);
    expect(ability.uuid).toBe('ability-uuid');
    expect(ability.action).toBe(Action.READ);
    expect(ability.subject).toBe(Subject.USER);
    expect(ability.status).toBe(RecordStatus.ACTIVE);
    expect(ability.createdAt).toBe(createdAt);
    expect(ability.updatedAt).toBe(updatedAt);
    expect(ability.deletedAt).toBeNull();
  });
});
