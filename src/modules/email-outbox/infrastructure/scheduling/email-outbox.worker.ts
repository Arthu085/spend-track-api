import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AppConfigService } from '@core/config';
import { describeError } from '@shared/application/logging';
import { DispatchEmailOutboxUseCase } from '../../application/use-cases/dispatch-email-outbox.use-case';

@Injectable()
export class EmailOutboxWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EmailOutboxWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly dispatchEmailOutbox: DispatchEmailOutboxUseCase,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const { workerEnabled, pollIntervalMs } = this.config.emailOutbox;

    if (!workerEnabled) {
      this.logger.log('Email outbox worker disabled');

      return;
    }

    this.timer = setInterval(() => void this.tick(), pollIntervalMs);
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }

  tick(): Promise<void> {
    if (this.stopping) {
      return Promise.resolve();
    }

    this.running ??= this.dispatch().finally(() => {
      this.running = undefined;
    });

    return this.running;
  }

  private async dispatch(): Promise<void> {
    try {
      const summary = await this.dispatchEmailOutbox.execute({
        shouldStop: () => this.stopping,
      });

      if (summary.sent + summary.retried + summary.failed > 0) {
        this.logger.log({ msg: 'Email outbox dispatched', ...summary });
      }
    } catch (error) {
      this.logger.error({
        msg: 'Email outbox dispatch failed',
        error: describeError(error),
      });
    }
  }
}
