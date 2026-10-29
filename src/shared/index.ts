export { BaseOrmEntity } from './infrastructure/persistence/base.orm-entity';
export { BaseTechnicalOrmEntity } from './infrastructure/persistence/base-technical.orm-entity';
export { BaseEntity } from './domain/entities/base.entity';
export { BaseTechnicalEntity } from './domain/entities/base-technical.entity';
export { BaseAuditedEntity } from './domain/entities/base-audited.entity';
export { RecordStatus } from './domain/enums/record-status.enum';
export { Action } from './domain/enums/action.enum';
export { AuditOutcome } from './domain/enums/audit-outcome.enum';
export { EmailType } from './domain/enums/email-type.enum';
export { Subject } from './domain/authorization/subject';
export type { AbilityPair } from './domain/authorization/ability-pair.type';
export {
  DomainError,
  NotFoundError,
  ConflictError,
  InactiveRecordError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  MissingAbilityError,
} from './domain/errors';
export { assertRecordActive } from './domain/policies';
export {
  MONEY_DECIMAL_PATTERN,
  formatMoney,
  parseMoney,
  sumMoney,
} from './domain/money';
export { PaginatedResult } from './application/dto';
export { normalizeTextFilter, normalizeEmail } from './application/filters';
export { OneTimeToken } from './application/tokens';
export {
  applyILikeFilter,
  applyExactFilter,
} from './infrastructure/persistence';
export { AUDIT_LOG_PORT } from './application/ports';
export type { AuditLogPort, AuditRecordInput } from './application/ports';
export { EMAIL_QUOTA_PORT } from './application/ports';
export type {
  EmailQuotaPort,
  EmailQuotaDecision,
  EmailQuotaRequest,
} from './application/ports';
export { TRANSACTION_MANAGER } from './application/ports';
export type { TransactionManagerPort } from './application/ports';
export { TOKEN_HASHER } from './application/ports';
export type { TokenHasher } from './application/ports';
export {
  PaginationQueryDto,
  TextFilterField,
  StatusFilterField,
  UuidFilterField,
  EmailField,
  MoneyField,
  DateOnlyField,
} from './presentation/dto';
export type { ResponseEnvelope, ResponseMeta } from './presentation/http';
export { CSRF_HEADER_NAME } from './presentation/http';
export type { AuthenticatedUser, RequestWithActor } from './presentation/http';
export { translateOrFallback } from './presentation/http';
export {
  ApiPaginatedResponse,
  CurrentActor,
  Translator,
} from './presentation/decorators';
export type { Translate } from './presentation/decorators';
export {
  ABILITY_METADATA_KEY,
  AUDIT_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
  PUBLIC_METADATA_KEY,
  AUDIT_CONTEXT_KEY,
  AUDIT_HANDLED_KEY,
  attachAuditContext,
  markAuditHandled,
} from './presentation/metadata';
export type {
  AuditContext,
  AuditCapableRequest,
} from './presentation/metadata';
export { endpoint, EndpointBuilder } from './presentation/builders';
export type {
  GuardInput,
  HttpMethod,
  InterceptorInput,
  PipeInput,
} from './presentation/builders';
