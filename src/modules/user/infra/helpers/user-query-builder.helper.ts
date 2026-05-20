import { SelectQueryBuilder } from 'typeorm';
import { UserOrmEntity } from '../entities/user.orm.entity';
import { UserFindAllCriteria } from '../../domain/types/user-find-all-criteria.type';

export class UserQueryBuilderHelper {
  static applyFilters(
    qb: SelectQueryBuilder<UserOrmEntity>,
    filters: UserFindAllCriteria,
  ): void {
    const { fullName, role } = filters;

    if (fullName) {
      qb.andWhere('user.fullName = :fullName', {
        fullName,
      });
    }

    if (role) {
      qb.andWhere('role.name = :role', {
        role,
      });
    }
  }
}
