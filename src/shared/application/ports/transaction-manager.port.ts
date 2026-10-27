export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

export interface TransactionManagerPort {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;

  runInSavepoint<T>(work: () => Promise<T>): Promise<T>;
}
