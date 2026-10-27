export abstract class BaseTechnicalEntity {
  protected constructor(
    readonly id: number,
    readonly uuid: string,
    readonly createdAt: Date,
  ) {}
}
