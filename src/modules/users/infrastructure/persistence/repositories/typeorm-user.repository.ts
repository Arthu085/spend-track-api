import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEnum } from '@modules/authorization';
import { In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import {
  applyExactFilter,
  applyILikeFilter,
  BaseTransactionalRepository,
  isUniqueViolation,
} from '@shared/infrastructure/persistence';
import { UserEntity } from '../../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import type {
  AuthSubject,
  PaginatedUsers,
  UserListFilters,
  UserRepository,
} from '../../../domain/repositories/user.repository';
import {
  USERS_EMAIL_UNIQUE_INDEX,
  UserOrmEntity,
} from '../entities/user.orm-entity';
import { UserMapper } from '../mappers/user.mapper';

const ROLES_RELATION = { roles: { abilities: true } };

@Injectable()
export class TypeOrmUserRepository
  extends BaseTransactionalRepository<UserOrmEntity>
  implements UserRepository
{
  constructor(
    @InjectRepository(UserOrmEntity)
    repository: Repository<UserOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginated(
    offset: number,
    limit: number,
    filters?: UserListFilters,
  ): Promise<PaginatedUsers> {
    const qb: SelectQueryBuilder<ObjectLiteral> = this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .orderBy('user.id', 'DESC')
      .skip(offset)
      .take(limit);

    applyILikeFilter(qb, 'user.name', 'name', filters?.name);
    applyILikeFilter(qb, 'user.email', 'email', filters?.email);
    applyExactFilter(qb, 'user.status', 'status', filters?.status);

    if (filters?.role) {
      qb.andWhere(
        `user.id IN (
          SELECT
            user_roles.user_id
          FROM user_roles
            INNER JOIN roles ON roles.id = user_roles.role_id
          WHERE roles.uuid = :role
        )`,
        { role: filters.role },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: await this.toDomainWithActorNames(rows as UserOrmEntity[]),
      total,
    };
  }

  async findByUuid(uuid: string): Promise<UserEntity | null> {
    const user = await this.repository.findOne({
      where: { uuid },
      relations: ROLES_RELATION,
    });

    if (!user) {
      return null;
    }

    const actorNames = await this.loadActorNames([user]);

    return UserMapper.toDomain(user, actorNames);
  }

  async findAuthSubject(uuid: string): Promise<AuthSubject | null> {
    const user = await this.repository
      .createQueryBuilder('user')
      .leftJoin('user.roles', 'role')
      .select([
        'user.id',
        'user.uuid',
        'user.status',
        'user.name',
        'user.email',
        'user.emailConfirmedAt',
        'role.id',
        'role.name',
      ])
      .where('user.uuid = :uuid', { uuid })
      .getOne();

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      uuid: user.uuid,
      status: user.status,
      name: user.name,
      email: user.email,
      emailConfirmedAt: user.emailConfirmedAt,
      roleNames: user.roles.map((role) => role.name),
    };
  }

  async findById(id: number): Promise<UserEntity | null> {
    const user = await this.repository.findOne({
      where: { id },
      relations: ROLES_RELATION,
    });

    if (!user) {
      return null;
    }

    const actorNames = await this.loadActorNames([user]);

    return UserMapper.toDomain(user, actorNames);
  }

  async findByUuidForUpdate(uuid: string): Promise<UserEntity | null> {
    await this.lockRow('uuid', uuid);

    return this.findByUuid(uuid);
  }

  async findByIdForUpdate(id: number): Promise<UserEntity | null> {
    await this.lockRow('id', id);

    return this.findById(id);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.repository.findOne({
      where: { email },
      relations: ROLES_RELATION,
    });

    return user ? UserMapper.toDomain(user) : null;
  }

  async lockAdminRoster(): Promise<void> {
    await this.repository.query('SELECT pg_advisory_xact_lock(672501, 1)');
  }

  async countActiveAdmins(): Promise<number> {
    return this.repository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('user.status = :userStatus', {
        userStatus: RecordStatus.ACTIVE,
      })
      .andWhere('role.name = :role', { role: RoleEnum.ADMIN })
      .andWhere('role.status = :roleStatus', {
        roleStatus: RecordStatus.ACTIVE,
      })
      .getCount();
  }

  async create(user: UserEntity): Promise<UserEntity> {
    const saved = await this.saveWithEmailConflictMapping(
      UserMapper.toOrm(user),
    );

    const reloaded = await this.repository.findOneOrFail({
      where: { id: saved.id },
      relations: ROLES_RELATION,
    });

    const actorNames = await this.loadActorNames([reloaded]);

    return UserMapper.toDomain(reloaded, actorNames);
  }

  async update(user: UserEntity): Promise<UserEntity> {
    const saved = await this.saveWithEmailConflictMapping(
      UserMapper.toOrm(user),
    );

    const reloaded = await this.repository.findOneOrFail({
      where: { id: saved.id },
      relations: ROLES_RELATION,
    });

    const actorNames = await this.loadActorNames([reloaded]);

    return UserMapper.toDomain(reloaded, actorNames);
  }

  async softDelete(user: UserEntity): Promise<void> {
    await this.repository.save(UserMapper.toOrm(user));
  }

  // Join-free because Postgres rejects row locks on the nullable side of the
  // roles outer join. NO KEY UPDATE, not UPDATE, so FK checks from token
  // inserts in other transactions (KEY SHARE) never wait on it and cannot
  // deadlock against a flow that holds the user row while touching tokens.
  private async lockRow(
    column: 'id' | 'uuid',
    value: number | string,
  ): Promise<void> {
    await this.repository
      .createQueryBuilder('user')
      .select('user.id')
      .where(`user.${column} = :value`, { value })
      .setLock('for_no_key_update')
      .getOne();
  }

  private async saveWithEmailConflictMapping(
    orm: UserOrmEntity,
  ): Promise<UserOrmEntity> {
    try {
      return await this.repository.save(orm);
    } catch (error) {
      if (isUniqueViolation(error, USERS_EMAIL_UNIQUE_INDEX)) {
        throw new EmailAlreadyInUseError();
      }

      throw error;
    }
  }

  private async toDomainWithActorNames(
    rows: UserOrmEntity[],
  ): Promise<UserEntity[]> {
    const actorNames = await this.loadActorNames(rows);

    return rows.map((row) => UserMapper.toDomain(row, actorNames));
  }

  private async loadActorNames(
    rows: UserOrmEntity[],
  ): Promise<ReadonlyMap<number, string>> {
    const ids = new Set<number>();

    for (const row of rows) {
      if (row.createdBy) {
        ids.add(row.createdBy);
      }

      if (row.updatedBy) {
        ids.add(row.updatedBy);
      }
    }

    if (ids.size === 0) {
      return new Map();
    }

    const actors = await this.repository.find({
      where: { id: In([...ids]) },
      select: { id: true, name: true },
      withDeleted: true,
    });

    return new Map(actors.map((actor) => [actor.id, actor.name]));
  }
}
