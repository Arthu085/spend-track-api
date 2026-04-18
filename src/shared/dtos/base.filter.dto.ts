import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { PaginationDto } from './pagination.dto';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BaseFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: StatusEnum })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdAtFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdAtTo?: string;
}
