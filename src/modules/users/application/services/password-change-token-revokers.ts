import { Injectable } from '@nestjs/common';
import type {
  PasswordChangeTokenRevoker,
  PasswordChangeTokenRevokerRegistry,
} from '../ports/password-change-token-revoker.port';

@Injectable()
export class PasswordChangeTokenRevokers implements PasswordChangeTokenRevokerRegistry {
  private readonly revokers: PasswordChangeTokenRevoker[] = [];

  register(revoker: PasswordChangeTokenRevoker): void {
    this.revokers.push(revoker);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    for (const revoker of this.revokers) {
      await revoker.revokeAllForUser(userId);
    }
  }
}
