import type { UserSessionRevoker } from '../../ports/user-session-revoker.port';
import { UserSessionRevokers } from '../user-session-revokers';

describe('UserSessionRevokers', () => {
  it('resolves without doing anything when no revoker is registered', async () => {
    await expect(
      new UserSessionRevokers().revokeAllForUser(7),
    ).resolves.toBeUndefined();
  });

  it('runs every registered revoker for the user, one after the other, in registration order', async () => {
    const events: string[] = [];
    const registry = new UserSessionRevokers();

    const revoker = (name: string): UserSessionRevoker => ({
      revokeAllForUser: jest.fn(async (userId: number) => {
        events.push(`${name}:start:${userId}`);
        await Promise.resolve();
        events.push(`${name}:end:${userId}`);
      }),
    });

    registry.register(revoker('first'));
    registry.register(revoker('second'));

    await registry.revokeAllForUser(7);

    expect(events).toEqual([
      'first:start:7',
      'first:end:7',
      'second:start:7',
      'second:end:7',
    ]);
  });

  it('stops and rejects on the first failure so the surrounding transaction rolls back', async () => {
    const registry = new UserSessionRevokers();
    const later = jest.fn();

    registry.register({
      revokeAllForUser: jest.fn().mockRejectedValue(new Error('db down')),
    });
    registry.register({ revokeAllForUser: later });

    await expect(registry.revokeAllForUser(7)).rejects.toThrow('db down');
    expect(later).not.toHaveBeenCalled();
  });
});
