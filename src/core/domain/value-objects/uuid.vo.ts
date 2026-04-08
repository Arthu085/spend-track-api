import { randomUUID } from 'crypto';

export class InvalidUuidError extends Error {
  constructor() {
    super('UUID Invalido');
  }
}

export class Uuid {
  private readonly value: string;

  private constructor(value?: string) {
    if (value) {
      if (!Uuid.isValid(value)) {
        throw new InvalidUuidError();
      }

      this.value = value;

      return;
    }

    this.value = randomUUID();
  }

  public static create(): Uuid {
    return new Uuid();
  }

  public static from(value: string): Uuid {
    return new Uuid(value);
  }

  public equals(other?: Uuid): boolean {
    if (!other) return false;
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }

  public static isValid(uuid: string): boolean {
    const regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    return regex.test(uuid);
  }
}
