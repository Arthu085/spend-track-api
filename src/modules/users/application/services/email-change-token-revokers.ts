import { Injectable } from '@nestjs/common';
import type {
  EmailChangeTokenRevoker,
  EmailChangeTokenRevokerRegistry,
} from '../ports/email-change-token-revoker.port';

@Injectable()
export class EmailChangeTokenRevokers implements EmailChangeTokenRevokerRegistry {
  private readonly revokers: EmailChangeTokenRevoker[] = [];

  register(revoker: EmailChangeTokenRevoker): void {
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
