export function mockOf<T extends object>(implementation: Partial<T> = {}): T {
  return implementation as T;
}
