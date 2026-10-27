export abstract class DomainError extends Error {
  readonly args?: Record<string, unknown>;

  protected constructor(
    readonly messageKey: string,
    args?: Record<string, unknown>,
  ) {
    super(messageKey);
    this.name = new.target.name;
    this.args = args;
  }
}
