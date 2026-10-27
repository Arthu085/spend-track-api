import { AuditLog } from '../../../domain/entities/audit-log.entity';
import { AuditLogOrmEntity } from '../entities/audit-log.orm-entity';

export class AuditLogMapper {
  static toDomain(orm: AuditLogOrmEntity): AuditLog {
    return AuditLog.create({
      uuid: orm.uuid,
      userId: orm.userId,
      action: orm.action,
      method: orm.method,
      path: orm.path,
      outcome: orm.outcome,
      statusCode: orm.statusCode,
      context: orm.context,
      errorMessage: orm.errorMessage,
      occurredAt: orm.createdAt,
    });
  }

  static toOrm(domain: AuditLog): AuditLogOrmEntity {
    const orm = new AuditLogOrmEntity();

    orm.uuid = domain.uuid;
    orm.userId = domain.userId;
    orm.action = domain.action;
    orm.method = domain.method;
    orm.path = domain.path;
    orm.outcome = domain.outcome;
    orm.statusCode = domain.statusCode;
    orm.context = domain.context;
    orm.errorMessage = domain.errorMessage;

    return orm;
  }
}
