import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  appConfig,
  cookieConfig,
  corsConfig,
  databaseConfig,
  emailOutboxConfig,
  emailQuotaConfig,
  jwtConfig,
  loggingConfig,
  mailConfig,
  refreshTokenCleanupConfig,
  retentionCleanupConfig,
  throttleConfig,
  verificationTokensConfig,
} from '../configurations';

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
    @Inject(databaseConfig.KEY)
    private readonly databaseCfg: ConfigType<typeof databaseConfig>,
    @Inject(jwtConfig.KEY)
    private readonly jwtCfg: ConfigType<typeof jwtConfig>,
    @Inject(corsConfig.KEY)
    private readonly corsCfg: ConfigType<typeof corsConfig>,
    @Inject(throttleConfig.KEY)
    private readonly throttleCfg: ConfigType<typeof throttleConfig>,
    @Inject(cookieConfig.KEY)
    private readonly cookieCfg: ConfigType<typeof cookieConfig>,
    @Inject(loggingConfig.KEY)
    private readonly loggingCfg: ConfigType<typeof loggingConfig>,
    @Inject(refreshTokenCleanupConfig.KEY)
    private readonly refreshTokenCleanupCfg: ConfigType<
      typeof refreshTokenCleanupConfig
    >,
    @Inject(verificationTokensConfig.KEY)
    private readonly verificationTokensCfg: ConfigType<
      typeof verificationTokensConfig
    >,
    @Inject(mailConfig.KEY)
    private readonly mailCfg: ConfigType<typeof mailConfig>,
    @Inject(emailQuotaConfig.KEY)
    private readonly emailQuotaCfg: ConfigType<typeof emailQuotaConfig>,
    @Inject(retentionCleanupConfig.KEY)
    private readonly retentionCleanupCfg: ConfigType<
      typeof retentionCleanupConfig
    >,
    @Inject(emailOutboxConfig.KEY)
    private readonly emailOutboxCfg: ConfigType<typeof emailOutboxConfig>,
  ) {}

  get app(): ConfigType<typeof appConfig> {
    return this.appCfg;
  }

  get database(): ConfigType<typeof databaseConfig> {
    return this.databaseCfg;
  }

  get jwt(): ConfigType<typeof jwtConfig> {
    return this.jwtCfg;
  }

  get cors(): ConfigType<typeof corsConfig> {
    return this.corsCfg;
  }

  get throttle(): ConfigType<typeof throttleConfig> {
    return this.throttleCfg;
  }

  get cookie(): ConfigType<typeof cookieConfig> {
    return this.cookieCfg;
  }

  get logging(): ConfigType<typeof loggingConfig> {
    return this.loggingCfg;
  }

  get refreshTokenCleanup(): ConfigType<typeof refreshTokenCleanupConfig> {
    return this.refreshTokenCleanupCfg;
  }

  get verificationTokens(): ConfigType<typeof verificationTokensConfig> {
    return this.verificationTokensCfg;
  }

  get mail(): ConfigType<typeof mailConfig> {
    return this.mailCfg;
  }

  get emailQuota(): ConfigType<typeof emailQuotaConfig> {
    return this.emailQuotaCfg;
  }

  get retentionCleanup(): ConfigType<typeof retentionCleanupConfig> {
    return this.retentionCleanupCfg;
  }

  get emailOutbox(): ConfigType<typeof emailOutboxConfig> {
    return this.emailOutboxCfg;
  }
}
