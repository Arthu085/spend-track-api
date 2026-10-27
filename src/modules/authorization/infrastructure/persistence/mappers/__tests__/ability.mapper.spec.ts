import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AbilityEntity } from '../../../../domain/entities/ability.entity';
import { AbilityOrmEntity } from '../../entities/ability.orm-entity';
import { AbilityMapper } from '../ability.mapper';

describe('AbilityMapper', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  it('maps an ORM row to a domain AbilityEntity', () => {
    const orm = new AbilityOrmEntity();
    orm.id = 1;
    orm.uuid = 'ability-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.action = Action.CREATE;
    orm.subject = Subject.USER;
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const domain = AbilityMapper.toDomain(orm);

    expect(domain).toBeInstanceOf(AbilityEntity);
    expect(domain.id).toBe(1);
    expect(domain.uuid).toBe('ability-uuid');
    expect(domain.action).toBe(Action.CREATE);
    expect(domain.subject).toBe(Subject.USER);
    expect(domain.createdAt).toBe(createdAt);
  });

  it('round-trips a domain AbilityEntity through toOrm and back via toDomain', () => {
    const domain = AbilityEntity.reconstitute({
      id: 2,
      uuid: 'ability-uuid-2',
      status: RecordStatus.ACTIVE,
      action: Action.DELETE,
      subject: Subject.ROLE,
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    const orm = AbilityMapper.toOrm(domain);

    expect(orm).toBeInstanceOf(AbilityOrmEntity);
    expect(orm.id).toBe(2);
    expect(orm.uuid).toBe('ability-uuid-2');
    expect(orm.action).toBe(Action.DELETE);
    expect(orm.subject).toBe(Subject.ROLE);

    const roundTripped = AbilityMapper.toDomain(orm);

    expect(roundTripped.uuid).toBe(domain.uuid);
    expect(roundTripped.action).toBe(domain.action);
    expect(roundTripped.subject).toBe(domain.subject);
  });
});
