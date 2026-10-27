import { randomBytes, randomUUID } from 'node:crypto';

const SEPARATOR = '.';
const SECRET_BYTES = 32;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OneTimeToken {
  private constructor(
    readonly uuid: string,
    readonly secret: string,
  ) {}

  static issue(): OneTimeToken {
    return new OneTimeToken(
      randomUUID(),
      randomBytes(SECRET_BYTES).toString('base64url'),
    );
  }

  static parse(value: string): OneTimeToken | null {
    const parts = value.split(SEPARATOR);

    if (parts.length !== 2) {
      return null;
    }

    const [uuid, secret] = parts;

    if (!UUID_PATTERN.test(uuid) || !secret) {
      return null;
    }

    return new OneTimeToken(uuid, secret);
  }

  toString(): string {
    return `${this.uuid}${SEPARATOR}${this.secret}`;
  }
}
