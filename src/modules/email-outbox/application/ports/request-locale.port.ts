export const REQUEST_LOCALE = Symbol('REQUEST_LOCALE');

export interface RequestLocalePort {
  current(): string;
}
