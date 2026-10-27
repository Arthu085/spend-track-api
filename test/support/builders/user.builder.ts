import { randomUUID } from 'node:crypto';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  type CreateUserInput,
  type ReconstituteUserInput,
  UserEntity,
} from '@modules/users/domain/entities/user.entity';

export function buildUser(
  overrides: Partial<ReconstituteUserInput> = {},
): UserEntity {
  return UserEntity.reconstitute({
    id: 1,
    uuid: 'user-uuid',
    status: RecordStatus.ACTIVE,
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'hashed-password',
    emailConfirmedAt: new Date(),
    roles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    ...overrides,
  });
}

export function buildNewUser(
  overrides: Partial<CreateUserInput> = {},
): UserEntity {
  return UserEntity.create({
    uuid: randomUUID(),
    name: 'Jane Doe',
    email: `${randomUUID()}@example.com`,
    password: 'hashed-password',
    roles: [],
    createdBy: null,
    ...overrides,
  });
}
