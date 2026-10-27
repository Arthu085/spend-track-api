import { Injectable } from '@nestjs/common';
import type {
  UserSessionRevoker,
  UserSessionRevokerRegistry,
} from '../ports/user-session-revoker.port';

@Injectable()
export class UserSessionRevokers implements UserSessionRevokerRegistry {
  private readonly revokers: UserSessionRevoker[] = [];

  register(revoker: UserSessionRevoker): void {
    this.revokers.push(revoker);
  }

  // Sequential on purpose: every revoker writes through the same ambient
  // transaction connection, which runs one statement at a time.
  async revokeAllForUser(userId: number): Promise<void> {
    for (const revoker of this.revokers) {
      await revoker.revokeAllForUser(userId);
    }
  }
}
