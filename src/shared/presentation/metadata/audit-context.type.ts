import type { RequestWithActor } from '../http/authenticated-user.type';

export interface AuditContext {
  readonly action: string;
}

export const AUDIT_CONTEXT_KEY: unique symbol = Symbol(
  'endpoint:audit-context',
);
export const AUDIT_HANDLED_KEY: unique symbol = Symbol(
  'endpoint:audit-handled',
);
export const AUDIT_ACTOR_KEY: unique symbol = Symbol('endpoint:audit-actor');
export const AUDIT_REFERENCE_KEY: unique symbol = Symbol(
  'endpoint:audit-reference',
);

export interface AuditCapableRequest extends RequestWithActor {
  [AUDIT_CONTEXT_KEY]?: AuditContext;
  [AUDIT_HANDLED_KEY]?: boolean;
  [AUDIT_ACTOR_KEY]?: string;
  [AUDIT_REFERENCE_KEY]?: string;
}

export function attachAuditContext(
  request: AuditCapableRequest,
  context: AuditContext,
): void {
  Object.defineProperty(request, AUDIT_CONTEXT_KEY, {
    value: context,
    enumerable: false,
    configurable: true,
  });
}

export function markAuditHandled(request: AuditCapableRequest): void {
  Object.defineProperty(request, AUDIT_HANDLED_KEY, {
    value: true,
    enumerable: false,
    configurable: true,
  });
}

export function attachAuditActor(
  request: AuditCapableRequest,
  actorId: string,
): void {
  Object.defineProperty(request, AUDIT_ACTOR_KEY, {
    value: actorId,
    enumerable: false,
    configurable: true,
  });
}

export function readAuditActorId(
  request: AuditCapableRequest,
): string | undefined {
  return request[AUDIT_ACTOR_KEY];
}

export function attachAuditReferenceId(
  request: AuditCapableRequest,
  referenceId: string,
): void {
  Object.defineProperty(request, AUDIT_REFERENCE_KEY, {
    value: referenceId,
    enumerable: false,
    configurable: true,
  });
}

export function readAuditReferenceId(
  request: AuditCapableRequest,
): string | undefined {
  return request[AUDIT_REFERENCE_KEY];
}
