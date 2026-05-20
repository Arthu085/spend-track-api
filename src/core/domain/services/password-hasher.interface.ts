export interface IPasswordHasher {
  hash(plain: string, rounds?: number): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
