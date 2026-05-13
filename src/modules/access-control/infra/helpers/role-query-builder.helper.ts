import { SelectQueryBuilder } from 'typeorm';
import { RoleOrmEntity } from '../entities/role.orm.entity';
import { FindAllRoleRequestDto } from '../../application/dtos/request/find-all-role.request.dto';

export class RoleQueryBuilderHelper {
  static applyFilters(
    qb: SelectQueryBuilder<RoleOrmEntity>,
    filters: FindAllRoleRequestDto,
  ): void {
    const { name } = filters;

    if (name) {
      qb.andWhere('role.name = :name', {
        name,
      });
    }
  }
}
