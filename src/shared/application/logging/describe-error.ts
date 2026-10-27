import { redactEmails } from './mask-email';

export function describeError(error: unknown): string {
  return redactEmails(error instanceof Error ? error.message : String(error));
}
