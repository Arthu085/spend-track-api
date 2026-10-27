import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  attachAuditContext,
  AUDIT_METADATA_KEY,
  type AuditCapableRequest,
} from '@shared/presentation/metadata';

@Injectable()
export class AuditContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const action = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (action === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuditCapableRequest>();
    attachAuditContext(request, { action });

    return true;
  }
}
