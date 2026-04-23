import { DataSource, Repository } from 'typeorm';
import { RoleEntity } from '../../domain/entities/role.entity';
import { IRoleRepository } from '../../domain/repositories/role.repository.interface';
import { RoleOrmEntity } from '../entities/role.orm.entity';
import { RoleMapper } from '../mappers/role.mapper';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { FindAllRoleRequestDto } from '../../application/dtos/request/find-all-role.request.dto';
import { QueryBuilderHelper } from 'src/core/database/helpers/query-builder.helper';

export class RoleRepository implements IRoleRepository {
  private repo: Repository<RoleOrmEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(RoleOrmEntity);
  }

  async findAll(query: FindAllRoleRequestDto): Promise<[RoleEntity[], number]> {
    const { page = 1, limit = 10 } = query;

    const qb = this.repo.createQueryBuilder('role');

    QueryBuilderHelper.applyBaseFilters(qb, 'role', query);
    QueryBuilderHelper.applyDefaultOrder(qb, 'role');
    QueryBuilderHelper.applyPagination(qb, page, limit);

    const [roles, total] = await qb.getManyAndCount();

    return [roles.map((role) => RoleMapper.toDomain(role)), total];
  }

  async findByUuid(uuid: Uuid): Promise<RoleEntity | null> {
    const role = await this.repo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.roleAbilities', 'roleAbilities')
      .leftJoinAndSelect('roleAbilities.ability', 'ability')
      .orderBy('ability.subject', 'ASC')
      .addOrderBy('ability.action', 'ASC')
      .where('role.uuid = :uuid', { uuid: uuid.toString() })
      .getOne();

    return role ? RoleMapper.toDomain(role) : null;
  }
}
