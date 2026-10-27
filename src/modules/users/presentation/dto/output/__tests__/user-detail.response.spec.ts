import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { AbilityEntity } from '@modules/authorization/domain/entities/ability.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { UserListResponseDto } from '../user-list.response';
import { UserDetailResponseDto } from '../user-detail.response';
import { RoleListResponseDto } from '@modules/authorization/presentation/dto/output/role-list.response';
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

describe('UserDetailResponseDto.fromDomain', () => {
  it('is an instance of UserListResponseDto', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserDetailResponseDto.fromDomain(buildUser(), translate);

    expect(dto).toBeInstanceOf(UserListResponseDto);
  });

  it('maps base fields correctly', () => {
    const translate = jest.fn(() => 'Ativo');

    const dto = UserDetailResponseDto.fromDomain(buildUser(), translate);

    expect(dto.uuid).toBe('user-uuid');
    expect(dto.name).toBe('Jane Doe');
    expect(dto.email).toBe('jane@example.com');
    expect(dto.status).toBe(RecordStatus.ACTIVE);
    expect(dto.statusLabel).toBe('Ativo');
  });

  it('maps roles as an array of RoleListResponseDto instances, without abilities', () => {
    const translate = jest.fn(() => 'Administrator');

    const dto = UserDetailResponseDto.fromDomain(
      buildUser({ roles: [buildRole()] }),
      translate,
    );

    expect(translate).toHaveBeenCalledWith('authorization.role_label.admin');
    expect(dto.roles).toHaveLength(1);
    expect(dto.roles[0]).toBeInstanceOf(RoleListResponseDto);
    expect(dto.roles[0].roleLabel).toBe('Administrator');
    expect(dto.roles[0]).not.toHaveProperty('abilities');
  });

  it('maps non-null creatorName/updaterName through unchanged', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserDetailResponseDto.fromDomain(
      buildUser({
        creatorName: 'Creator Name',
        updaterName: 'Updater Name',
      }),
      translate,
    );

    expect(dto.creatorName).toBe('Creator Name');
    expect(dto.updaterName).toBe('Updater Name');
  });

  it('maps null creatorName/updaterName through as null', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserDetailResponseDto.fromDomain(buildUser(), translate);

    expect(dto.creatorName).toBeNull();
    expect(dto.updaterName).toBeNull();
  });

  it('maps a null emailConfirmedAt through as null', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserDetailResponseDto.fromDomain(
      buildUser({ emailConfirmedAt: null }),
      translate,
    );

    expect(dto.emailConfirmedAt).toBeNull();
  });

  it('maps a set emailConfirmedAt through unchanged', () => {
    const translate = jest.fn((key: string) => key);
    const confirmedAt = new Date('2026-02-01T00:00:00.000Z');

    const user = buildUser({ emailConfirmedAt: confirmedAt });

    const dto = UserDetailResponseDto.fromDomain(user, translate);

    expect(dto.emailConfirmedAt).toBe(confirmedAt);
  });

  it('maps createdAt/updatedAt through unchanged', () => {
    const translate = jest.fn((key: string) => key);
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');

    const user = buildUser({ createdAt, updatedAt });

    const dto = UserDetailResponseDto.fromDomain(user, translate);

    expect(dto.createdAt).toBe(createdAt);
    expect(dto.updatedAt).toBe(updatedAt);
  });

  it('never exposes the password hash', () => {
    const translate = jest.fn((key: string) => key);

    const dto = UserDetailResponseDto.fromDomain(
      buildUser({
        creatorName: 'Creator Name',
        updaterName: 'Updater Name',
      }),
      translate,
    );

    expect(dto).not.toHaveProperty('password');
  });
});
