import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { normalizeTextFilter } from '@shared/application/filters';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { UserEntity } from '../../domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type UserListFilters,
  type UserRepository,
} from '../../domain/repositories/user.repository';

export interface ListUsersInput {
  page: number;
  limit: number;
  name?: string;
  email?: string;
  role?: string;
  status?: RecordStatus;
}

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(input: ListUsersInput): Promise<PaginatedResult<UserEntity>> {
    const filters: UserListFilters = {
      name: normalizeTextFilter(input.name),
      email: normalizeTextFilter(input.email),
      role: input.role,
      status: input.status ?? RecordStatus.ACTIVE,
    };

    const { items, total } = await this.userRepository.findAllPaginated(
      (input.page - 1) * input.limit,
      input.limit,
      filters,
    );

    return PaginatedResult.of(items, total, input.page, input.limit);
  }
}
