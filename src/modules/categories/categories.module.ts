import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateCategoryUseCase } from './application/use-cases/create-category.use-case';
import { GetCategoryUseCase } from './application/use-cases/get-category.use-case';
import { ListCategoriesUseCase } from './application/use-cases/list-categories.use-case';
import { UpdateCategoryStatusUseCase } from './application/use-cases/update-category-status.use-case';
import { UpdateCategoryUseCase } from './application/use-cases/update-category.use-case';
import { CATEGORY_REPOSITORY } from './domain/repositories/category.repository';
import { CategoryOrmEntity } from './infrastructure/persistence/entities/category.orm-entity';
import { TypeOrmCategoryRepository } from './infrastructure/persistence/repositories/typeorm-category.repository';
import { CategoriesController } from './presentation/controllers/categories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryOrmEntity])],
  controllers: [CategoriesController],
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: TypeOrmCategoryRepository },
    ListCategoriesUseCase,
    GetCategoryUseCase,
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    UpdateCategoryStatusUseCase,
  ],
})
export class CategoriesModule {}
