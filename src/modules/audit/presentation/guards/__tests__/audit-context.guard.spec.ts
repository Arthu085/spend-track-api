import 'reflect-metadata';
import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUDIT_CONTEXT_KEY,
  AUDIT_METADATA_KEY,
  type AuditCapableRequest,
} from '@shared/presentation/metadata';
import { AuditContextGuard } from '../audit-context.guard';

class UnannotatedController {
  handler(): void {}
}

class MethodAnnotatedController {
  @SetMetadata(AUDIT_METADATA_KEY, 'Method.action')
  handler(): void {}
}

@SetMetadata(AUDIT_METADATA_KEY, 'Class.action')
class ClassAnnotatedController {
  handler(): void {}
}

const createContext = (
  ControllerClass: new () => { handler: () => void },
  request: AuditCapableRequest,
  type: 'http' | 'rpc' = 'http',
): ExecutionContext => {
  const instance = new ControllerClass();

  return {
    getType: () => type,
    getHandler: () => instance.handler,
    getClass: () => ControllerClass,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

describe('AuditContextGuard', () => {
  const guard = new AuditContextGuard(new Reflector());

  it('always returns true, whether the route is annotated or not', () => {
    expect(
      guard.canActivate(
        createContext(MethodAnnotatedController, {} as AuditCapableRequest),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        createContext(UnannotatedController, {} as AuditCapableRequest),
      ),
    ).toBe(true);
  });

  it('attaches an audit context for a route annotated at the method level', () => {
    const request = {} as AuditCapableRequest;

    guard.canActivate(createContext(MethodAnnotatedController, request));

    expect(request[AUDIT_CONTEXT_KEY]).toEqual({ action: 'Method.action' });
  });

  it('attaches an audit context for a route annotated at the controller class level', () => {
    const request = {} as AuditCapableRequest;

    guard.canActivate(createContext(ClassAnnotatedController, request));

    expect(request[AUDIT_CONTEXT_KEY]).toEqual({ action: 'Class.action' });
  });

  it('does not attach an audit context for an un-annotated route', () => {
    const request = {} as AuditCapableRequest;

    guard.canActivate(createContext(UnannotatedController, request));

    expect(request[AUDIT_CONTEXT_KEY]).toBeUndefined();
  });

  it('does not resolve metadata for non-HTTP execution contexts', () => {
    const request = {} as AuditCapableRequest;

    expect(
      guard.canActivate(
        createContext(MethodAnnotatedController, request, 'rpc'),
      ),
    ).toBe(true);
    expect(request[AUDIT_CONTEXT_KEY]).toBeUndefined();
  });
});
