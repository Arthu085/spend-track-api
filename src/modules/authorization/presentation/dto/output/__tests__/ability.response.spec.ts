import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { AbilityEntity } from '../../../../domain/entities/ability.entity';
import { AbilityResponseDto } from '../ability.response';

function buildAbility(): AbilityEntity {
  return AbilityEntity.reconstitute({
    id: 1,
    uuid: 'ability-uuid',
    status: RecordStatus.ACTIVE,
    action: Action.READ,
    subject: Subject.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('AbilityResponseDto.fromDomain', () => {
  it('resolves subjectLabel via the translate callback when the key resolves', () => {
    const translate = jest.fn(() => 'User');

    const dto = AbilityResponseDto.fromDomain(buildAbility(), translate);

    expect(translate).toHaveBeenCalledWith('authorization.subject_label.user');
    expect(dto.subjectLabel).toBe('User');
    expect(dto.uuid).toBe('ability-uuid');
    expect(dto.action).toBe(Action.READ);
    expect(dto.subject).toBe(Subject.USER);
  });

  it('falls back to the raw subject code when translate returns the key unchanged', () => {
    const translate = jest.fn((key: string) => key);

    const dto = AbilityResponseDto.fromDomain(buildAbility(), translate);

    expect(dto.subjectLabel).toBe(Subject.USER);
  });

  it('resolves actionLabel via the translate callback when the key resolves', () => {
    const translate = jest.fn(() => 'Read');

    const dto = AbilityResponseDto.fromDomain(buildAbility(), translate);

    expect(translate).toHaveBeenCalledWith('enums.action.read');
    expect(dto.actionLabel).toBe('Read');
  });

  it('falls back to the raw action code when translate returns the key unchanged', () => {
    const translate = jest.fn((key: string) => key);

    const dto = AbilityResponseDto.fromDomain(buildAbility(), translate);

    expect(dto.actionLabel).toBe(Action.READ);
  });
});
