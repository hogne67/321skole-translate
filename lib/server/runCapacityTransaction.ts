import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";

type AttemptState = { writesScheduled: boolean };
class ClosedReadError extends Error {
  readonly code = 3;
  constructor(readonly original: unknown, readonly state: AttemptState) {
    super(original instanceof Error ? original.message : "3 INVALID_ARGUMENT: Transaction is invalid or closed.");
  }
}

function isClosedTransaction(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== 3) return false;
  const message = "message" in error ? error.message : undefined;
  const details = "details" in error ? error.details : undefined;
  return details === "Transaction is invalid or closed."
    || message === "Transaction is invalid or closed."
    || message === "3 INVALID_ARGUMENT: Transaction is invalid or closed.";
}

/**
 * Recover a closed read transaction with a fresh SDK transaction, never by
 * reusing its ID or repeating a write/ambiguous commit. The installed streaming
 * client can hide ABORTED behind INVALID_ARGUMENT after retrying the same read.
 * Every retry re-runs the complete callback and its capacity/authorization reads.
 */
export async function runCapacityTransaction<T>(
  db: Pick<Firestore, "runTransaction">,
  update: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  for (let freshAttempt = 0; ; freshAttempt++) {
    // Persist across native callbacks too: an earlier ambiguous commit must
    // never be repeated as an unrelated fresh transaction.
    const state: AttemptState = { writesScheduled: false };
    try {
      return await db.runTransaction(async transaction => {
        const guarded: Transaction = new Proxy(transaction, {
          get(target, key) {
            const value = Reflect.get(target, key, target);
            if (typeof value !== "function") return value;
            if (key === "get" || key === "getAll") return async (...args: unknown[]) => {
              try { return await Reflect.apply(value, target, args); }
              catch (error) {
                if (!state.writesScheduled && isClosedTransaction(error)) throw new ClosedReadError(error, state);
                throw error;
              }
            };
            if (["create", "set", "update", "delete"].includes(String(key))) return (...args: unknown[]) => {
              state.writesScheduled = true;
              const result = Reflect.apply(value, target, args);
              return result === target ? guarded : result;
            };
            return value.bind(target);
          },
        });
        return update(guarded);
      });
    } catch (error) {
      if (!(error instanceof ClosedReadError)) throw error;
      if (error.state.writesScheduled || freshAttempt >= 2) throw error.original;
    }
  }
}
