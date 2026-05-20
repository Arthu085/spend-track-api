export class InvalidUserEmailError extends Error {
  constructor() {
    super('Email inválido');
  }
}

export class UserEmail {
  private readonly value: string;

  private constructor(value: string, skipValidation = false) {
    const normalized = value.trim().toLowerCase();

    if (!skipValidation && !UserEmail.isValid(normalized)) {
      throw new InvalidUserEmailError();
    }

    this.value = normalized;
  }

  public static create(value: string): UserEmail {
    return new UserEmail(value);
  }

  public static reconstitute(value: string): UserEmail {
    return new UserEmail(value, true);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other?: UserEmail): boolean {
    if (!other) return false;
    return this.value === other.value;
  }

  private static isValid(value: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  }
}
