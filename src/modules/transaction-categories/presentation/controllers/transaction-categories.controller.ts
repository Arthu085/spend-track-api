import { Body, Controller, HttpStatus, Param, Query } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { CreateTransactionCategoryUseCase } from '../../application/use-cases/create-transaction-category.use-case';
import { DeleteTransactionCategoryUseCase } from '../../application/use-cases/delete-transaction-category.use-case';
import { GetTransactionCategoryUseCase } from '../../application/use-cases/get-transaction-category.use-case';
import { ListTransactionCategoriesUseCase } from '../../application/use-cases/list-transaction-categories.use-case';
import { UpdateTransactionCategoryStatusUseCase } from '../../application/use-cases/update-transaction-category-status.use-case';
import { UpdateTransactionCategoryUseCase } from '../../application/use-cases/update-transaction-category.use-case';
import { CreateTransactionCategoryDto } from '../dto/input/create-transaction-category.dto';
import { ListTransactionCategoriesQueryDto } from '../dto/input/list-transaction-categories-query.dto';
import { UpdateTransactionCategoryStatusDto } from '../dto/input/update-transaction-category-status.dto';
import { UpdateTransactionCategoryDto } from '../dto/input/update-transaction-category.dto';
import { TransactionCategoryResponseDto } from '../dto/output/transaction-category.response';

const VISIBILITY_NOTE =
  "Global transaction categories are visible to everyone; personal ones only to their owner, so another user's personal transaction category answers 404 whatever the caller's roles.";

@Controller('transaction-categories')
export class TransactionCategoriesController {
  constructor(
    private readonly listTransactionCategories: ListTransactionCategoriesUseCase,
    private readonly getTransactionCategory: GetTransactionCategoryUseCase,
    private readonly createTransactionCategory: CreateTransactionCategoryUseCase,
    private readonly updateTransactionCategory: UpdateTransactionCategoryUseCase,
    private readonly updateTransactionCategoryStatus: UpdateTransactionCategoryStatusUseCase,
    private readonly deleteTransactionCategory: DeleteTransactionCategoryUseCase,
  ) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('transaction-categories')
    .summary('List the global transaction categories and your personal ones')
    .description(
      `Defaults to ACTIVE transaction categories, ordered by kind and stored name. ${VISIBILITY_NOTE}`,
    )
    .paginatedResponse(TransactionCategoryResponseDto)
    .build())
  async findAll(
    @Query() query: ListTransactionCategoriesQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<PaginatedResult<TransactionCategoryResponseDto>> {
    const categories = await this.listTransactionCategories.execute({
      ownerId: actor.id,
      page: query.page,
      limit: query.limit,
      kind: query.kind,
      scope: query.scope,
      status: query.status,
    });

    return categories.map((category) =>
      TransactionCategoryResponseDto.fromDomain(category, translate),
    );
  }

  @(endpoint()
    .get(':uuid')
    .successMessage('success.ok')
    .tags('transaction-categories')
    .summary('Get a global or personal transaction category by uuid')
    .description(VISIBILITY_NOTE)
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Transaction category is inactive.')
    .response(TransactionCategoryResponseDto)
    .build())
  async findOne(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionCategoryResponseDto> {
    const category = await this.getTransactionCategory.execute(uuid, actor.id);

    return TransactionCategoryResponseDto.fromDomain(category, translate);
  }

  @(endpoint()
    .post()
    .httpCode(HttpStatus.CREATED)
    .audit('TransactionCategory.create')
    .successMessage('success.created')
    .tags('transaction-categories')
    .summary('Create a personal transaction category')
    .body(CreateTransactionCategoryDto)
    .response(TransactionCategoryResponseDto, HttpStatus.CREATED)
    .build())
  async create(
    @Body() dto: CreateTransactionCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionCategoryResponseDto> {
    const category = await this.createTransactionCategory.execute({
      ownerId: actor.id,
      name: dto.name,
      kind: dto.kind,
      color: dto.color ?? null,
    });

    return TransactionCategoryResponseDto.fromDomain(category, translate);
  }

  @(endpoint()
    .patch(':uuid')
    .audit('TransactionCategory.update')
    .successMessage('success.updated')
    .tags('transaction-categories')
    .summary('Update one of your personal transaction categories')
    .description(
      `Partial update of name and color; the kind never changes. Global transaction categories are read-only. ${VISIBILITY_NOTE}`,
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Global transaction categories are read-only.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction category not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Transaction category is inactive.')
    .body(UpdateTransactionCategoryDto)
    .response(TransactionCategoryResponseDto)
    .build())
  async update(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateTransactionCategoryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionCategoryResponseDto> {
    const category = await this.updateTransactionCategory.execute({
      uuid,
      ownerId: actor.id,
      name: dto.name,
      color: dto.color,
    });

    return TransactionCategoryResponseDto.fromDomain(category, translate);
  }

  @(endpoint()
    .put(':uuid/status')
    .audit('TransactionCategory.update_status')
    .successMessage('success.updated')
    .tags('transaction-categories')
    .summary(
      'Deactivate or reactivate one of your personal transaction categories',
    )
    .description(
      `Inactive transaction categories leave selection lists, but records that use them keep them. Global transaction categories are read-only. ${VISIBILITY_NOTE}`,
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Global transaction categories are read-only.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction category not found.')
    .body(UpdateTransactionCategoryStatusDto)
    .response(TransactionCategoryResponseDto)
    .build())
  async updateStatus(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateTransactionCategoryStatusDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<TransactionCategoryResponseDto> {
    const category = await this.updateTransactionCategoryStatus.execute({
      uuid,
      ownerId: actor.id,
      status: dto.status,
    });

    return TransactionCategoryResponseDto.fromDomain(category, translate);
  }

  @(endpoint()
    .delete(':uuid')
    .audit('TransactionCategory.delete')
    .successMessage('success.deleted')
    .tags('transaction-categories')
    .summary('Soft-delete one of your personal transaction categories')
    .description(
      `Removes the personal transaction category from every list. Global transaction categories are read-only. ${VISIBILITY_NOTE}`,
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Global transaction categories are read-only.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Transaction category not found.')
    .build())
  async remove(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteTransactionCategory.execute({ uuid, ownerId: actor.id });
  }
}
