import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../../domain/entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserOrmEntity } from '../entities/user.orm.entity';
import { UserMapper } from '../mappers/user.mapper';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { SaveUserRelations } from '../../application/types/save-user-relations.type';
import { FindAllUserRequestDto } from '../../application/dtos/request/find-all-user.request.dto';
import { QueryBuilderHelper } from 'src/core/database/helpers/query-builder.helper';
import { UserQueryBuilderHelper } from '../helpers/user-query-builder.helper';

@Injectable()
export class UserRepository implements IUserRepository {
  private repo: Repository<UserOrmEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(UserOrmEntity);
  }

  async findAll(query: FindAllUserRequestDto): Promise<[UserEntity[], number]> {
    const { page = 1, limit = 10 } = query;

    const qb = this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role');

    QueryBuilderHelper.applyBaseFilters(qb, 'user', query);
    UserQueryBuilderHelper.applyFilters(qb, query);
    QueryBuilderHelper.applyDefaultOrder(qb, 'user');
    QueryBuilderHelper.applyPagination(qb, page, limit);

    const [users, total] = await qb.getManyAndCount();

    return [users.map((user) => UserMapper.toDomain(user)), total];
  }

  async findByUuid(uuid: Uuid): Promise<UserEntity | null> {
    const user = await this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.uuid = :uuid', { uuid: uuid.toString() })
      .getOne();

    return user ? UserMapper.toDomain(user) : null;
  }

  async findByEmail(email: UserEmail): Promise<UserEntity | null> {
    const user = await this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.email = :email', { email: email.getValue() })
      .getOne();

    return user ? UserMapper.toDomain(user) : null;
  }

  async save(user: UserEntity, relations: SaveUserRelations): Promise<void> {
    const ormUser = UserMapper.toOrm(user, relations);

    await this.repo.save(ormUser);
  }
}
