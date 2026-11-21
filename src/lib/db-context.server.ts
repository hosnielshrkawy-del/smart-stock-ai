import { AsyncLocalStorage } from "node:async_hooks";

export type DatabaseRequestContext = {
  userId: string;
  orgIds: string[];
};

const context = new AsyncLocalStorage<DatabaseRequestContext>();

export function runWithDatabaseContext<T>(
  value: DatabaseRequestContext,
  callback: () => T,
): T {
  return context.run(value, callback);
}

export function getDatabaseContext(): DatabaseRequestContext | undefined {
  return context.getStore();
}
