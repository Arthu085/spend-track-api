export class InvalidUserEmailError extends Error {
  constructor() {
    super('Email inválido');
  }
}

export class UserEmail {
  private readonly value: string;

  private constructor(value: string) {
    if (!UserEmail.isValid(value)) {
      throw new InvalidUserEmailError();
    }

    this.value = value.toLowerCase();
  }

  public static create(value: string): UserEmail {
    return new UserEmail(value);
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
