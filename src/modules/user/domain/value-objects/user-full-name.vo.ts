export class InvalidUserFullNameError extends Error {
  constructor() {
    super('Nome completo inválido');
  }
}

export class UserFullName {
  private readonly value: string;

  private constructor(value: string, skipValidation = false) {
    if (!skipValidation && !UserFullName.isValid(value)) {
      throw new InvalidUserFullNameError();
    }

    this.value = UserFullName.normalize(value);
  }

  public static create(value: string): UserFullName {
    return new UserFullName(value);
  }

  public static reconstitute(value: string): UserFullName {
    return new UserFullName(value, true);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other?: UserFullName): boolean {
    if (!other) return false;
    return this.value === other.value;
  }

  private static normalize(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private static isValid(value: string): boolean {
    if (!value) return false;

    const tokens = UserFullName.normalize(value).split(' ').filter(Boolean);

    return tokens.length >= 2;
  }
}
