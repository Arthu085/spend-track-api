import { DomainError } from '@shared/domain/errors';

export function assertEmailConfirmed(
  user: { readonly emailConfirmedAt: Date | null },
  error: DomainError,
): void {
  if (user.emailConfirmedAt === null) {
    throw error;
  }
}
