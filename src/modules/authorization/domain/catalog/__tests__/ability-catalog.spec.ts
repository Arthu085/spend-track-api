import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { RoleEnum } from '../../enums/role.enum';
import { ABILITY_CATALOG, ROLE_ABILITY_GRANTS } from '../ability-catalog';

describe('ability-catalog', () => {
  it('defines every (Action, Subject) pair exactly once', () => {
    const pairs = new Set(
      ABILITY_CATALOG.map((entry) => `${entry.action}:${entry.subject}`),
    );

    expect(pairs.size).toBe(ABILITY_CATALOG.length);

    const actions = Object.values(Action);
    const subjects = Object.values(Subject);

    expect(ABILITY_CATALOG.length).toBe(actions.length * subjects.length);

    for (const action of actions) {
      for (const subject of subjects) {
        expect(pairs.has(`${action}:${subject}`)).toBe(true);
      }
    }
  });

  it('grants ADMIN the full catalog', () => {
    expect(ROLE_ABILITY_GRANTS[RoleEnum.ADMIN]).toBe(ABILITY_CATALOG);
    expect(ROLE_ABILITY_GRANTS[RoleEnum.ADMIN]).toHaveLength(
      ABILITY_CATALOG.length,
    );
  });

  it('grants USER exactly READ on Subject.USER', () => {
    expect(ROLE_ABILITY_GRANTS[RoleEnum.USER]).toEqual([
      { action: Action.READ, subject: Subject.USER },
    ]);
  });
});
