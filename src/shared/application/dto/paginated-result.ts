export class PaginatedResult<T> {
  private constructor(
    readonly items: T[],
    readonly total: number,
    readonly page: number,
    readonly limit: number,
  ) {}

  static of<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
    return new PaginatedResult<T>(items, total, page, limit);
  }

  map<U>(fn: (item: T) => U): PaginatedResult<U> {
    return new PaginatedResult<U>(
      this.items.map((item) => fn(item)),
      this.total,
      this.page,
      this.limit,
    );
  }
}
