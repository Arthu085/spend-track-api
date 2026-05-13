import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';
import { BaseFilterDto } from 'src/shared/dtos/base.filter.dto';

export class FindAllRoleRequestDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: RoleEnum })
  @IsOptional()
  @IsEnum(RoleEnum)
  name?: RoleEnum;
}
