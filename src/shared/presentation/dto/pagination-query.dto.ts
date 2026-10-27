import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number, starting at 1.',
    default: DEFAULT_PAGE,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Number of items per page.',
    default: DEFAULT_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(MAX_LIMIT, { message: i18nValidationMessage('validation.MAX') })
  limit: number = DEFAULT_LIMIT;

  get offset(): number {
    return (this.page - 1) * this.limit;
  }
}
