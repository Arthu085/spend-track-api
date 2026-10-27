import {
  Controller,
  Header,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { endpoint } from '@shared/presentation/builders';
import { HealthStatusResponseDto } from '../dto/health-status.response';
import { ReadinessService } from '../services/readiness.service';

@Controller('health')
export class HealthController {
  constructor(private readonly readinessService: ReadinessService) {}

  @(endpoint()
    .get('live')
    .public()
    .skipThrottle()
    .use(Header('Cache-Control', 'no-store'))
    .tags('health')
    .summary('Liveness probe')
    .description(
      'Returns 200 while the process can answer HTTP requests. Checks no ' +
        'dependency, so a database or SMTP outage never fails it; use it ' +
        'to decide when to restart the container.',
    )
    .response(HealthStatusResponseDto)
    .build())
  live(): HealthStatusResponseDto {
    return HealthStatusResponseDto.ok();
  }

  @(endpoint()
    .get('ready')
    .public()
    .skipThrottle()
    .use(Header('Cache-Control', 'no-store'))
    .tags('health')
    .summary('Readiness probe')
    .description(
      'Returns 200 when the instance can serve requests: PostgreSQL answers ' +
        'a SELECT 1 within a bounded timeout. Use it to decide whether to ' +
        'route traffic to the instance. SMTP and the email outbox backlog ' +
        'are not checked.',
    )
    .response(HealthStatusResponseDto)
    .errorResponse(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PostgreSQL is unreachable or did not answer within the timeout.',
    )
    .build())
  async ready(): Promise<HealthStatusResponseDto> {
    if (!(await this.readinessService.isReady())) {
      throw new ServiceUnavailableException('errors.service_unavailable');
    }

    return HealthStatusResponseDto.ok();
  }
}
