import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { translateOrFallback } from '@shared/presentation/http';
import { TransactionCategoryEntity } from '../../../domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '../../../domain/enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../../../domain/enums/transaction-category-scope.enum';

export class TransactionCategoryResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({
    description:
      'Global transaction categories are named in the request language.',
  })
  name!: string;

  @ApiProperty({ enum: TransactionCategoryKind })
  kind!: TransactionCategoryKind;

  @ApiProperty()
  kindLabel!: string;

  @ApiProperty({
    enum: TransactionCategoryScope,
    description:
      'GLOBAL transaction categories are read-only; PERSONAL ones are yours.',
  })
  scope!: TransactionCategoryScope;

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
    category: TransactionCategoryEntity,
    translate: (key: string) => string,
  ): TransactionCategoryResponseDto {
    const dto = new TransactionCategoryResponseDto();

    dto.uuid = category.uuid;
    dto.name =
      category.code === null
        ? category.name
        : translateOrFallback(
            translate,
            `transaction_categories.global.${category.code.toLowerCase()}`,
            category.name,
          );
    dto.kind = category.kind;
    dto.kindLabel = translateOrFallback(
      translate,
      `transaction_categories.kind.${category.kind.toLowerCase()}`,
      category.kind,
    );
    dto.scope = category.scope;
    dto.scopeLabel = translateOrFallback(
      translate,
      `transaction_categories.scope.${category.scope.toLowerCase()}`,
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
