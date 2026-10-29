import { Controller, Query } from '@nestjs/common';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { GetDashboardUseCase } from '../../application/use-cases/get-dashboard.use-case';
import { DashboardQueryDto } from '../dto/input/dashboard-query.dto';
import { DashboardResponseDto } from '../dto/output/dashboard.response';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly getDashboard: GetDashboardUseCase) {}

  @(endpoint()
    .get()
    .successMessage('success.ok')
    .tags('dashboard')
    .summary("Get the authenticated user's monthly financial summary")
    .description(
      "Available to every authenticated user, without any ability, and always computed from the caller's own records only. Without year and month it opens the preferred default month; perspective overrides the stored spending perspective for this request only. Amounts are decimal strings in BRL.",
    )
    .response(DashboardResponseDto)
    .build())
  async findMine(
    @Query() query: DashboardQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<DashboardResponseDto> {
    const summary = await this.getDashboard.execute({
      ownerId: actor.id,
      year: query.year,
      month: query.month,
      perspective: query.perspective,
    });

    return DashboardResponseDto.fromDomain(summary, translate);
  }
}
