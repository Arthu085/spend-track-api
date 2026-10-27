export const TOKEN_HASHER = Symbol('TOKEN_HASHER');

export interface TokenHasher {
  hash(token: string): string;
  verify(hash: string, token: string): boolean;
}
