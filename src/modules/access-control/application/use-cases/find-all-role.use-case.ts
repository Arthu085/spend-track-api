import { Injectable, Inject } from '@nestjs/common';
import { IRoleRepository } from '../../domain/repositories/role.repository.interface';
import { PaginatedResponse } from 'src/shared/interfaces/paginated-response.interface';
import { FindAllRoleResponseDto } from '../dtos/response/find-all-role.respose.dto';
import { FindAllRoleRequestDto } from '../dtos/request/find-all-role.request.dto';

@Injectable()
export class FindAllRoleUseCase {
  constructor(
    @Inject('IRoleRepository')
    private readonly roleRepo: IRoleRepository,
  ) {}

  async execute(
    query: FindAllRoleRequestDto,
  ): Promise<PaginatedResponse<FindAllRoleResponseDto>> {
    const { page = 1, limit = 10 } = query;

    const [roles, total] = await this.roleRepo.findAll(query);

    return {
      data: roles.map((role) => new FindAllRoleResponseDto(role)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
