import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CategoryKind } from '../enums/category-kind.enum';
import { CategoryScope } from '../enums/category-scope.enum';

export interface CategoryDetails {
  name: string;
  color: string | null;
}

export interface CreatePersonalCategoryInput extends CategoryDetails {
  uuid: string;
  ownerId: number;
  kind: CategoryKind;
}

export interface ReconstituteCategoryInput extends CategoryDetails {
  id: number;
  uuid: string;
  status: RecordStatus;
  ownerId: number | null;
  code: string | null;
  kind: CategoryKind;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class CategoryEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number | null,
    readonly code: string | null,
    readonly name: string,
    readonly kind: CategoryKind,
    readonly color: string | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static createPersonal(input: CreatePersonalCategoryInput): CategoryEntity {
    const now = new Date();

    return CategoryEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      code: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(input: ReconstituteCategoryInput): CategoryEntity {
    return new CategoryEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.code,
      input.name,
      input.kind,
      input.color,
    );
  }

  get scope(): CategoryScope {
    return this.ownerId === null
      ? CategoryScope.GLOBAL
      : CategoryScope.PERSONAL;
  }

  withDetails(details: CategoryDetails): CategoryEntity {
    return this.copyWith(details);
  }

  withStatus(status: RecordStatus): CategoryEntity {
    return this.copyWith({ status });
  }

  private copyWith(
    changes: Partial<
      Pick<ReconstituteCategoryInput, 'name' | 'color' | 'status'>
    >,
  ): CategoryEntity {
    return CategoryEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      code: this.code,
      name: this.name,
      kind: this.kind,
      color: this.color,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
