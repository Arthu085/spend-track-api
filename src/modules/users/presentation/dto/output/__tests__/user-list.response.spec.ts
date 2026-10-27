import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { AbilityEntity } from '@modules/authorization/domain/entities/ability.entity';
import { RoleListResponseDto } from '@modules/authorization/presentation/dto/output/role-list.response';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { UserListResponseDto } from '../user-list.response';
import { buildUser } from '@test/support/builders/user.builder';

function buildRole(): RoleEntity {
  const ability = AbilityEntity.reconstitute({
    id: 1,
    uuid: 'ability-uuid',
    status: RecordStatus.ACTIVE,
    action: Action.READ,
    subject: Subject.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

  return RoleEntity.reconstitute({
    id: 1,
    uuid: 'role-uuid',
    status: RecordStatus.ACTIVE,
    name: RoleEnum.ADMIN,
    abilities: [ability],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('UserListResponseDto.fromDomain', () => {
  it('maps uuid/name/status correctly', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserListResponseDto.fromDomain(buildUser(), translate);

    expect(dto.uuid).toBe('user-uuid');
    expect(dto.name).toBe('Jane Doe');
    expect(dto.status).toBe(RecordStatus.ACTIVE);
  });

  it('resolves statusLabel via the translate callback when the key resolves', () => {
    const translate = jest.fn(() => 'Ativo');

    const dto = UserListResponseDto.fromDomain(buildUser(), translate);

    expect(translate).toHaveBeenCalledWith('enums.record_status.active');
    expect(dto.statusLabel).toBe('Ativo');
  });

  it('falls back to the raw status code when translate returns the key unchanged', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserListResponseDto.fromDomain(buildUser(), translate);

    expect(dto.statusLabel).toBe(RecordStatus.ACTIVE);
  });

  it('never exposes the password hash', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserListResponseDto.fromDomain(buildUser(), translate);

    expect(dto).not.toHaveProperty('password');
  });

  it('does not carry detail-only fields', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserListResponseDto.fromDomain(buildUser(), translate);

    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('emailConfirmedAt');
    expect(dto).not.toHaveProperty('creatorName');
    expect(dto).not.toHaveProperty('updaterName');
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
  });

  it('maps roles as an array of RoleListResponseDto instances, without abilities', () => {
    const translate = jest.fn(() => 'Administrator');

    const dto = UserListResponseDto.fromDomain(
      buildUser({ roles: [buildRole()] }),
      translate,
    );

    expect(translate).toHaveBeenCalledWith('authorization.role_label.admin');
    expect(dto.roles).toHaveLength(1);
    expect(dto.roles[0]).toBeInstanceOf(RoleListResponseDto);
    expect(dto.roles[0].role).toBe(RoleEnum.ADMIN);
    expect(dto.roles[0].roleLabel).toBe('Administrator');
    expect(dto.roles[0]).not.toHaveProperty('abilities');
  });

  it('maps an empty roles array through unchanged', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserListResponseDto.fromDomain(buildUser(), translate);

    expect(dto.roles).toEqual([]);
  });
});
