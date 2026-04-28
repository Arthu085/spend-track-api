import * as bcrypt from 'bcrypt';

export class InvalidUserPasswordError extends Error {
  constructor() {
    super('Senha inválida');
  }
}

export class UserPassword {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static async create(plain: string): Promise<UserPassword> {
    if (!UserPassword.isValid(plain)) {
      throw new InvalidUserPasswordError();
    }

    const hash = await bcrypt.hash(plain, 10);
    return new UserPassword(hash);
  }

  public static fromHash(hash: string): UserPassword {
    return new UserPassword(hash);
  }

  public async compare(plain: string): Promise<boolean> {
    return await bcrypt.compare(plain, this.value);
  }

  public getValue(): string {
    return this.value;
  }

  private static isValid(value: string): boolean {
    if (!value) return false;

    return value.length >= 6;
  }
}
