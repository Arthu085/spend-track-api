import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

const NONCE_BYTES = 32;
const HMAC_CONTEXT = 'csrf-token';
const TOKEN_PATTERN = /^([0-9a-f]{64})\.([0-9a-f]{64})$/;

function signNonce(nonce: string, sessionId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${HMAC_CONTEXT}:${sessionId}:${nonce}`)
    .digest('hex');
}

export function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createCsrfSessionId(): string {
  return randomUUID();
}

export function createCsrfToken(sessionId: string, secret: string): string {
  const nonce = randomBytes(NONCE_BYTES).toString('hex');

  return `${nonce}.${signNonce(nonce, sessionId, secret)}`;
}

export function isCsrfTokenBoundTo(
  token: string,
  sessionId: string,
  secret: string,
): boolean {
  const match = TOKEN_PATTERN.exec(token);

  if (match === null) {
    return false;
  }

  const [, nonce, signature] = match;

  return constantTimeEquals(signature, signNonce(nonce, sessionId, secret));
}
