import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { ReadinessService } from './services/readiness.service';

@Module({
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class CoreHealthModule {}
