import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEntity } from '../../../../domain/entities/role.entity';
import { RoleEnum } from '../../../../domain/enums/role.enum';
import { RoleListResponseDto } from '../role-list.response';

function buildRole(status: RecordStatus = RecordStatus.ACTIVE): RoleEntity {
  return RoleEntity.reconstitute({
    id: 1,
    uuid: 'role-uuid',
    status,
    name: RoleEnum.ADMIN,
    abilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('RoleListResponseDto.fromDomain', () => {
  it('maps uuid and role correctly', () => {
    const translate = jest.fn((key: string) => key);

    const dto = RoleListResponseDto.fromDomain(buildRole(), translate);

    expect(dto.uuid).toBe('role-uuid');
    expect(dto.role).toBe(RoleEnum.ADMIN);
  });

  it('resolves roleLabel via the translate callback when the key resolves', () => {
    const translate = jest.fn(() => 'Administrator');

    const dto = RoleListResponseDto.fromDomain(buildRole(), translate);

    expect(translate).toHaveBeenCalledWith('authorization.role_label.admin');
    expect(dto.roleLabel).toBe('Administrator');
  });

  it('falls back to the raw role code when translate returns the key unchanged', () => {
    const translate = jest.fn((key: string) => key);

    const dto = RoleListResponseDto.fromDomain(buildRole(), translate);

    expect(dto.roleLabel).toBe(RoleEnum.ADMIN);
  });

  it('exposes the role status with its translated label', () => {
    const translate = jest.fn((key: string) =>
      key === 'enums.record_status.inactive' ? 'Inativo' : key,
    );

    const dto = RoleListResponseDto.fromDomain(
      buildRole(RecordStatus.INACTIVE),
      translate,
    );

    expect(dto.status).toBe(RecordStatus.INACTIVE);
    expect(dto.statusLabel).toBe('Inativo');
  });

  it('does not carry the old "name" field', () => {
    const translate = jest.fn((key: string) => key);

    const dto = RoleListResponseDto.fromDomain(buildRole(), translate);

    expect(dto).not.toHaveProperty('name');
  });

  it('does not carry detail-only fields', () => {
    const translate = jest.fn((key: string) => key);

    const dto = RoleListResponseDto.fromDomain(buildRole(), translate);

    expect(dto).not.toHaveProperty('abilities');
  });
});
