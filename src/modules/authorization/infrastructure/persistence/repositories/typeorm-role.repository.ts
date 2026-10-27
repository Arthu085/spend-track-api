import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import { RoleEntity } from '../../../domain/entities/role.entity';
import type { RoleRepository } from '../../../domain/repositories/role.repository';
import { RoleOrmEntity } from '../entities/role.orm-entity';
import { RoleMapper } from '../mappers/role.mapper';

const ABILITIES_RELATION = { abilities: true };

@Injectable()
export class TypeOrmRoleRepository
  extends BaseTransactionalRepository<RoleOrmEntity>
  implements RoleRepository
{
  constructor(
    @InjectRepository(RoleOrmEntity)
    repository: Repository<RoleOrmEntity>,
  ) {
    super(repository);
  }

  async findAll(): Promise<RoleEntity[]> {
    const roles = await this.repository.find({
      relations: ABILITIES_RELATION,
    });

    return roles.map((role) => RoleMapper.toDomain(role));
  }

  async findByUuid(uuid: string): Promise<RoleEntity | null> {
    const role = await this.repository.findOne({
      where: { uuid },
      relations: ABILITIES_RELATION,
    });

    return role ? RoleMapper.toDomain(role) : null;
  }

  async findByUuids(uuids: string[]): Promise<RoleEntity[]> {
    if (uuids.length === 0) {
      return [];
    }

    const roles = await this.repository.find({
      where: { uuid: In(uuids) },
      relations: ABILITIES_RELATION,
    });

    return roles.map((role) => RoleMapper.toDomain(role));
  }

  async update(role: RoleEntity): Promise<RoleEntity> {
    const orm = RoleMapper.toOrm(role);
    const saved = await this.repository.save(orm);

    const reloaded = await this.repository.findOneOrFail({
      where: { id: saved.id },
      relations: ABILITIES_RELATION,
    });

    return RoleMapper.toDomain(reloaded);
  }
}
