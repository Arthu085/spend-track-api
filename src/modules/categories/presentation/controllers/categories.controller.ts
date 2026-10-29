import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateCategoryUseCase } from '../../application/use-cases/create-category.use-case';
import { GetCategoryUseCase } from '../../application/use-cases/get-category.use-case';
import { ListCategoriesUseCase } from '../../application/use-cases/list-categories.use-case';
import { UpdateCategoryStatusUseCase } from '../../application/use-cases/update-category-status.use-case';
import { UpdateCategoryUseCase } from '../../application/use-cases/update-category.use-case';
import { CreateCategoryDto } from '../dto/input/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/input/list-categories-query.dto';
import { UpdateCategoryStatusDto } from '../dto/input/update-category-status.dto';
import { UpdateCategoryDto } from '../dto/input/update-category.dto';
import { CategoryResponseDto } from '../dto/output/category.response';

const VISIBILITY_NOTE =
  "Global categories are visible to everyone; personal ones only to their owner, so another user's personal category answers 404 whatever the caller's roles.";

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly listCategories: ListCategoriesUseCase,
    private readonly getCategory: GetCategoryUseCase,
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly updateCategoryStatus: UpdateCategoryStatusUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('categories')
    .summary('List the global categories and your personal ones')
    .description(
      `Not paginated. Defaults to ACTIVE categories, ordered by kind and stored name. ${VISIBILITY_NOTE}`,
    )
    .response(CategoryResponseDto, undefined, { isArray: true })
    .build())
  async findAll(
    @Query() query: ListCategoriesQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CategoryResponseDto[]> {
    const categories = await this.listCategories.execute({
      ownerId: actor.id,
      kind: query.kind,
      scope: query.scope,
      status: query.status,
    });

    return categories.map((category) =>
      CategoryResponseDto.fromDomain(category, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('categories')
    .summary('Get a global or personal category by uuid')
    .description(VISIBILITY_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Category is archived.')
    .response(CategoryResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CategoryResponseDto> {
    const category = await this.getCategory.execute(uuid, actor.id);

    return CategoryResponseDto.fromDomain(category, translate);
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('Category.create')
    .successMessage('success.created')
    .tags('categories')
    .summary('Create a personal category')
    .body(CreateCategoryDto)
    .response(CategoryResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CategoryResponseDto> {
    const category = await this.createCategory.execute({
      ownerId: actor.id,
      name: dto.name,
      kind: dto.kind,
      color: dto.color ?? null,
    });

    return CategoryResponseDto.fromDomain(category, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('Category.update')
    .successMessage('success.updated')
    .tags('categories')
    .summary('Update one of your personal categories')
    .description(
      `Partial update of name and color; the kind never changes. Global categories are read-only. ${VISIBILITY_NOTE}`,
    )
    .errorResponse(HttpStatus.FORBIDDEN, 'Global categories are read-only.')
    .errorResponse(HttpStatus.NOT_FOUND, 'Category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Category is archived.')
    .body(UpdateCategoryDto)
    .response(CategoryResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CategoryResponseDto> {
    const category = await this.updateCategory.execute({
      uuid,
      ownerId: actor.id,
      name: dto.name,
      color: dto.color,
    });

    return CategoryResponseDto.fromDomain(category, translate);
  }

  @(endpoint()
    .put(':uuid/status')
    .audit('Category.update_status')
    .successMessage('success.updated')
    .tags('categories')
    .summary('Archive or restore one of your personal categories')
    .description(
      `Archived categories leave selection lists, but records that use them keep them. Global categories are read-only. ${VISIBILITY_NOTE}`,
    )
    .errorResponse(HttpStatus.FORBIDDEN, 'Global categories are read-only.')
    .errorResponse(HttpStatus.NOT_FOUND, 'Category not found.')
    .body(UpdateCategoryStatusDto)
    .response(CategoryResponseDto)
    .build())
  async updateStatus(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateCategoryStatusDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<CategoryResponseDto> {
    const category = await this.updateCategoryStatus.execute({
      uuid,
      ownerId: actor.id,
      status: dto.status,
    });

    return CategoryResponseDto.fromDomain(category, translate);
  }
}
