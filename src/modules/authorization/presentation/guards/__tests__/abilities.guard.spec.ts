import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { MissingAbilityError, UnauthorizedError } from '@shared/domain/errors';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { AbilitiesGuard } from '../abilities.guard';

function buildContext(overrides: {
  type?: string;
  required?: AbilityPair[] | undefined;
  user?: unknown;
}): { context: ExecutionContext; reflector: Reflector } {
  const getAllAndOverride = jest.fn().mockReturnValue(overrides.required);
  const reflector = { getAllAndOverride } as unknown as Reflector;

  const context = {
    getType: () => overrides.type ?? 'http',
    getHandler: () => jest.fn(),
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user: overrides.user }),
    }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('AbilitiesGuard', () => {
  it('allows the request (and never queries the repository) when no ability metadata is present', async () => {
    const findGrantedAbilities = jest.fn();
    const { context, reflector } = buildContext({ required: undefined });

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findGrantedAbilities).not.toHaveBeenCalled();
  });

  it('allows the request when the required ability list is empty', async () => {
    const findGrantedAbilities = jest.fn();
    const { context, reflector } = buildContext({ required: [] });

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findGrantedAbilities).not.toHaveBeenCalled();
  });

  it('bypasses non-http contexts', async () => {
    const { context, reflector } = buildContext({ type: 'rpc' });

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities: jest.fn(),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws UnauthorizedError when no actor can be resolved from the request', async () => {
    const { context, reflector } = buildContext({
      required: [{ action: Action.READ, subject: Subject.USER }],
      user: undefined,
    });

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities: jest.fn(),
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws MissingAbilityError listing only the missing ability when the actor lacks one of several required abilities (AND semantics)', async () => {
    const { context, reflector } = buildContext({
      required: [
        { action: Action.READ, subject: Subject.USER },
        { action: Action.UPDATE, subject: Subject.USER },
      ],
      user: { uuid: 'user-uuid' },
    });

    const findGrantedAbilities = jest
      .fn()
      .mockResolvedValue([{ action: Action.READ, subject: Subject.USER }]);

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities,
    });

    let caught: unknown;

    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingAbilityError);
    expect((caught as MissingAbilityError).requiredAbilities).toEqual([
      { action: Action.UPDATE, subject: Subject.USER },
    ]);
    expect(findGrantedAbilities).toHaveBeenCalledWith('user-uuid');
  });

  it('throws MissingAbilityError listing every required ability when the actor holds none of them', async () => {
    const required = [
      { action: Action.READ, subject: Subject.USER },
      { action: Action.UPDATE, subject: Subject.USER },
    ];

    const { context, reflector } = buildContext({
      required,
      user: { uuid: 'user-uuid' },
    });

    const findGrantedAbilities = jest.fn().mockResolvedValue([]);

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities,
    });

    let caught: unknown;

    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MissingAbilityError);
    expect((caught as MissingAbilityError).requiredAbilities).toEqual(required);
  });

  it('allows the request when the actor holds every required ability', async () => {
    const { context, reflector } = buildContext({
      required: [
        { action: Action.READ, subject: Subject.USER },
        { action: Action.UPDATE, subject: Subject.USER },
      ],
      user: { uuid: 'user-uuid' },
    });

    const findGrantedAbilities = jest.fn().mockResolvedValue([
      { action: Action.READ, subject: Subject.USER },
      { action: Action.UPDATE, subject: Subject.USER },
      { action: Action.DELETE, subject: Subject.ROLE },
    ]);

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('re-queries the repository on every call (no caching across invocations)', async () => {
    const { context, reflector } = buildContext({
      required: [{ action: Action.READ, subject: Subject.USER }],
      user: { uuid: 'user-uuid' },
    });

    const findGrantedAbilities = jest
      .fn()
      .mockResolvedValue([{ action: Action.READ, subject: Subject.USER }]);

    const guard = new AbilitiesGuard(reflector, {
      findGrantedAbilities,
    });

    await guard.canActivate(context);
    await guard.canActivate(context);

    expect(findGrantedAbilities).toHaveBeenCalledTimes(2);
  });
});
