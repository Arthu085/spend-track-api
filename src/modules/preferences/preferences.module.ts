import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GetPreferencesUseCase } from './application/use-cases/get-preferences.use-case';
import { UpdatePreferencesUseCase } from './application/use-cases/update-preferences.use-case';
import { USER_PREFERENCES_REPOSITORY } from './domain/repositories/user-preferences.repository';
import { UserPreferencesOrmEntity } from './infrastructure/persistence/entities/user-preferences.orm-entity';
import { TypeOrmUserPreferencesRepository } from './infrastructure/persistence/repositories/typeorm-user-preferences.repository';
import { PreferencesController } from './presentation/controllers/preferences.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserPreferencesOrmEntity])],
  controllers: [PreferencesController],
  providers: [
    {
      provide: USER_PREFERENCES_REPOSITORY,
      useClass: TypeOrmUserPreferencesRepository,
    },
    GetPreferencesUseCase,
    UpdatePreferencesUseCase,
  ],
  exports: [USER_PREFERENCES_REPOSITORY],
})
export class PreferencesModule {}
