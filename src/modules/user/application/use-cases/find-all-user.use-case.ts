import { Injectable, Inject } from '@nestjs/common';
import { PaginatedResponse } from 'src/shared/interfaces/paginated-response.interface';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { FindAllUserRequestDto } from '../dtos/request/find-all-user.request.dto';
import { FindAllUserResponseDto } from '../dtos/response/find-all-user.response.dto';

@Injectable()
export class FindAllUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(
    query: FindAllUserRequestDto,
  ): Promise<PaginatedResponse<FindAllUserResponseDto>> {
    const { page = 1, limit = 10 } = query;

    const [users, total] = await this.userRepo.findAll({
      page: query.page,
      limit: query.limit,
      status: query.status,
      createdAtFrom: query.createdAtFrom,
      createdAtTo: query.createdAtTo,
      fullName: query.fullName,
      role: query.role,
    });

    return {
      data: users.map((user) => new FindAllUserResponseDto(user)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
