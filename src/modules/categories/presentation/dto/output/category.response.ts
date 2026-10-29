import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { translateOrFallback } from '@shared/presentation/http';
import { CategoryEntity } from '../../../domain/entities/category.entity';
import { CategoryKind } from '../../../domain/enums/category-kind.enum';
import { CategoryScope } from '../../../domain/enums/category-scope.enum';

export class CategoryResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({
    description: 'Global categories are named in the request language.',
  })
  name!: string;

  @ApiProperty({ enum: CategoryKind })
  kind!: CategoryKind;

  @ApiProperty()
  kindLabel!: string;

  @ApiProperty({
    enum: CategoryScope,
    description: 'GLOBAL categories are read-only; PERSONAL ones are yours.',
  })
  scope!: CategoryScope;

  @ApiProperty()
  scopeLabel!: string;

  @ApiProperty({ type: String, nullable: true, example: '#1A2B3C' })
  color!: string | null;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    category: CategoryEntity,
    translate: (key: string) => string,
  ): CategoryResponseDto {
    const dto = new CategoryResponseDto();

    dto.uuid = category.uuid;
    dto.name =
      category.code === null
        ? category.name
        : translateOrFallback(
            translate,
            `categories.global.${category.code.toLowerCase()}`,
            category.name,
          );
    dto.kind = category.kind;
    dto.kindLabel = translateOrFallback(
      translate,
      `categories.kind.${category.kind.toLowerCase()}`,
      category.kind,
    );
    dto.scope = category.scope;
    dto.scopeLabel = translateOrFallback(
      translate,
      `categories.scope.${category.scope.toLowerCase()}`,
      category.scope,
    );
    dto.color = category.color;
    dto.status = category.status;
    dto.statusLabel = translateOrFallback(
      translate,
      `enums.record_status.${category.status.toLowerCase()}`,
      category.status,
    );
    dto.createdAt = category.createdAt;
    dto.updatedAt = category.updatedAt;

    return dto;
  }
}
