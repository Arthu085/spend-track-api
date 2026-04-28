export class InvalidUserFullNameError extends Error {
  constructor() {
    super('Nome completo inválido');
  }
}

export class UserFullName {
  private readonly value: string;

  private constructor(value: string) {
    if (!UserFullName.isValid(value)) {
      throw new InvalidUserFullNameError();
    }

    this.value = value.trim();
  }

  public static create(value: string): UserFullName {
    return new UserFullName(value);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other?: UserFullName): boolean {
    if (!other) return false;
    return this.value === other.value;
  }

  private static isValid(value: string): boolean {
    if (!value) return false;

    const trimmed = value.trim();

    return trimmed.split(' ').length >= 2;
  }
}
