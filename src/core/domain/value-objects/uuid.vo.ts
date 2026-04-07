import { randomUUID } from 'crypto';
import { AppBadRequestException } from 'src/core/exceptions/app-bad-request.exception';

export class Uuid {
  private readonly value: string;

  constructor(value?: string) {
    if (value) {
      if (!Uuid.isValid(value)) {
        throw new AppBadRequestException({ message: 'UUID inválido' });
      }

      this.value = value;

      return;
    }

    this.value = randomUUID();
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Uuid): boolean {
    return this.value === other.getValue();
  }

  public static isValid(uuid: string): boolean {
    const regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    return regex.test(uuid);
  }

  public static create(): Uuid {
    return new Uuid();
  }

  public static from(value: string): Uuid {
    return new Uuid(value);
  }

  public toString(): string {
    return this.value;
  }
}
