import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TokenHasher } from '../../application/ports/token-hasher.port';

@Injectable()
export class Sha256TokenHasher implements TokenHasher {
  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  verify(hash: string, token: string): boolean {
    const expected = Buffer.from(hash, 'utf8');
    const actual = Buffer.from(this.hash(token), 'utf8');

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
