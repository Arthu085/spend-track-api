import type { EmailChangeTokenRevoker } from '../../ports/email-change-token-revoker.port';
import { EmailChangeTokenRevokers } from '../email-change-token-revokers';

describe('EmailChangeTokenRevokers', () => {
  it('resolves without doing anything when no revoker is registered', async () => {
    await expect(
      new EmailChangeTokenRevokers().revokeAllForUser(7),
    ).resolves.toBeUndefined();
  });

  it('runs every registered revoker for the user, one after the other, in registration order', async () => {
    const events: string[] = [];
    const registry = new EmailChangeTokenRevokers();

    const revoker = (name: string): EmailChangeTokenRevoker => ({
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
    const registry = new EmailChangeTokenRevokers();
    const later = jest.fn();

    registry.register({
      revokeAllForUser: jest.fn().mockRejectedValue(new Error('db down')),
    });
    registry.register({ revokeAllForUser: later });

    await expect(registry.revokeAllForUser(7)).rejects.toThrow('db down');
    expect(later).not.toHaveBeenCalled();
  });
});
