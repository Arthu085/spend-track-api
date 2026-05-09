import { SelectQueryBuilder } from 'typeorm';
import { UserOrmEntity } from '../entities/user.orm.entity';
import { FindAllUserRequestDto } from '../../application/dtos/request/find-all-user.request.dto';

export class UserQueryBuilderHelper {
  static applyFilters(
    qb: SelectQueryBuilder<UserOrmEntity>,
    filters: FindAllUserRequestDto,
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
