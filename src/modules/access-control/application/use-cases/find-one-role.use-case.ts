import { Injectable, Inject } from '@nestjs/common';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { IRoleRepository } from '../../domain/repositories/role.repository.interface';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';
import { FindOneRoleResponseDto } from '../dtos/response/find-one-role.response.dto';

@Injectable()
export class FindOneRoleUseCase {
  constructor(
    @Inject('IRoleRepository')
    private readonly roleRepo: IRoleRepository,
  ) {}

  async execute(uuid: string): Promise<FindOneRoleResponseDto> {
    const role = await this.roleRepo.findByUuid(Uuid.from(uuid));

    if (!role) {
      throw new AppNotFoundException({ resource: 'Função', gender: 'F' });
    }

    return new FindOneRoleResponseDto(role);
  }
}
