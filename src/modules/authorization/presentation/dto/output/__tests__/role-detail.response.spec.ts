import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { AbilityEntity } from '../../../../domain/entities/ability.entity';
import { RoleEntity } from '../../../../domain/entities/role.entity';
import { RoleEnum } from '../../../../domain/enums/role.enum';
import { RoleListResponseDto } from '../role-list.response';
import { RoleDetailResponseDto } from '../role-detail.response';

function buildRole(abilities: AbilityEntity[] = []): RoleEntity {
  return RoleEntity.reconstitute({
    id: 1,
    uuid: 'role-uuid',
    status: RecordStatus.ACTIVE,
    name: RoleEnum.ADMIN,
    abilities,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

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

describe('RoleDetailResponseDto.fromDomain', () => {
  it('is an instance of RoleListResponseDto', () => {
    const translate = jest.fn((key: string) => key);

    const dto = RoleDetailResponseDto.fromDomain(buildRole(), translate);

    expect(dto).toBeInstanceOf(RoleListResponseDto);
  });

  it('maps base fields correctly', () => {
    const translate = jest.fn(() => 'Administrator');

    const dto = RoleDetailResponseDto.fromDomain(buildRole(), translate);

    expect(translate).toHaveBeenCalledWith('authorization.role_label.admin');
    expect(dto.uuid).toBe('role-uuid');
    expect(dto.role).toBe(RoleEnum.ADMIN);
    expect(dto.roleLabel).toBe('Administrator');
  });

  it('maps abilities via AbilityResponseDto.fromDomain with matching values', () => {
    const translate = jest.fn((key: string) => key);

    const dto = RoleDetailResponseDto.fromDomain(
      buildRole([buildAbility()]),
      translate,
    );

    expect(dto.abilities).toHaveLength(1);
    expect(dto.abilities[0].uuid).toBe('ability-uuid');
    expect(dto.abilities[0].action).toBe(Action.READ);
    expect(dto.abilities[0].subject).toBe(Subject.USER);
  });

  it('maps an empty abilities array through as an empty array', () => {
    const translate = jest.fn((key: string) => key);

    const dto = RoleDetailResponseDto.fromDomain(buildRole([]), translate);

    expect(dto.abilities).toEqual([]);
  });
});
