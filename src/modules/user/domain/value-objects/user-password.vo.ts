export class InvalidUserPasswordError extends Error {
  constructor() {
    super('Senha inválida');
  }
}

export class InvalidUserPasswordHashError extends Error {
  constructor() {
    super('Hash de senha inválido');
  }
}

export class UserPassword {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static validatePlain(plain: string): void {
    if (!UserPassword.isValid(plain)) {
      throw new InvalidUserPasswordError();
    }
  }

  public static fromHash(hash: string): UserPassword {
    if (!UserPassword.isValidHash(hash)) {
      throw new InvalidUserPasswordHashError();
    }

    return new UserPassword(hash);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other?: UserPassword): boolean {
    if (!other) return false;
    return this.value === other.value;
  }

  private static isValid(value: string): boolean {
    if (!value) return false;

    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

    return strongPasswordRegex.test(value);
  }

  private static isValidHash(hash: string): boolean {
    return typeof hash === 'string' && hash.startsWith('$2');
  }
}
