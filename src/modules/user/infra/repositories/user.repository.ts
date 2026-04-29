import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../../domain/entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserOrmEntity } from '../entities/user.orm.entity';
import { UserMapper } from '../mappers/user.mapper';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';

@Injectable()
export class UserRepository implements IUserRepository {
  private repo: Repository<UserOrmEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(UserOrmEntity);
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
}
