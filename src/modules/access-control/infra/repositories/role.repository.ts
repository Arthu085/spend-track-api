import { DataSource, Repository } from 'typeorm';
import { RoleEntity } from '../../domain/entities/role.entity';
import { IRoleRepository } from '../../domain/repositories/role.repository';
import { RoleOrmEntity } from '../entities/role.orm.entity';
import { RoleMapper } from '../mappers/role.mapper';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { RoleEnum } from '../../domain/enums/role.enum';

export class RoleRepository implements IRoleRepository {
  private repo: Repository<RoleOrmEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(RoleOrmEntity);
  }

  async findAll(): Promise<RoleEntity[]> {
    const roles = await this.repo.find();

    return roles.map((role) => RoleMapper.toDomain(role));
  }

  async findById(id: number): Promise<RoleEntity | null> {
    const role = await this.repo.findOneBy({ id });

    return role ? RoleMapper.toDomain(role) : null;
  }

  async findByUuid(uuid: Uuid): Promise<RoleEntity | null> {
    const role = await this.repo.findOne({
      where: { uuid: uuid.toString() },
      relations: {
        roleAbilities: {
          ability: true,
        },
      },
    });

    return role ? RoleMapper.toDomain(role) : null;
  }

  async findByName(name: RoleEnum): Promise<RoleEntity | null> {
    const role = await this.repo.findOneBy({ name });

    return role ? RoleMapper.toDomain(role) : null;
  }
}
