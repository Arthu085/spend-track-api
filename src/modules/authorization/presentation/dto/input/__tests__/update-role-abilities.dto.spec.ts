import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { UpdateRoleAbilitiesDto } from '../update-role-abilities.dto';

async function validatePayload(payload: Record<string, unknown>) {
  return validate(plainToInstance(UpdateRoleAbilitiesDto, payload));
}

describe('UpdateRoleAbilitiesDto', () => {
  it('accepts an empty abilities array', async () => {
    await expect(validatePayload({ abilities: [] })).resolves.toHaveLength(0);
  });

  it('accepts distinct pairs that share an action or a subject', async () => {
    const errors = await validatePayload({
      abilities: [
        { action: Action.READ, subject: Subject.USER },
        { action: Action.UPDATE, subject: Subject.USER },
        { action: Action.READ, subject: Subject.ROLE },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects a repeated (action, subject) pair with arrayUnique', async () => {
    const errors = await validatePayload({
      abilities: [
        { action: Action.READ, subject: Subject.USER },
        { action: Action.UPDATE, subject: Subject.ROLE },
        { action: Action.READ, subject: Subject.USER },
      ],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('abilities');
    expect(errors[0].constraints).toHaveProperty('arrayUnique');
  });
});
