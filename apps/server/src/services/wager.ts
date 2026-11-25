import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, wagerEscrows } from "../db/schema.js";

export class WagerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface WagerHold {
  ids: string[];
  pot: number;
  stake: number;
}

/**
 * Deduct the stake from every registered player in one transaction. The rows
 * are the escrow ledger: they are released to the winner or refunded on abort.
 */
export async function holdWager(roomCode: string, userIds: string[], stake: number): Promise<WagerHold> {
  if (stake <= 0 || userIds.length < 2) {
    throw new WagerError("wager_players_needed", "A wager table needs at least two players.");
  }
  const unique = [...new Set(userIds)].sort();
  if (unique.length !== userIds.length) {
    throw new WagerError("wager_players", "A player cannot occupy two wager seats.");
  }

  return db.transaction(async (tx) => {
    for (const userId of unique) {
      const [updated] = await tx
        .update(users)
        .set({ coins: sql`${users.coins} - ${stake}` })
        .where(and(eq(users.id, userId), gte(users.coins, stake)))
        .returning({ id: users.id });
      if (!updated) {
        throw new WagerError("wager_funds", `Everyone needs ${stake} coins to start.`);
      }
    }
    const rows = await tx
      .insert(wagerEscrows)
      .values(unique.map((userId) => ({ roomCode, userId, amount: stake })))
      .returning({ id: wagerEscrows.id });
    return { ids: rows.map((row) => row.id), pot: stake * unique.length, stake };
  });
}

/** Refund every still-held row exactly once. */
export async function refundWager(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(wagerEscrows)
      .where(and(inArray(wagerEscrows.id, ids), eq(wagerEscrows.status, "held")));
    for (const row of rows) {
      await tx
        .update(users)
        .set({ coins: sql`${users.coins} + ${row.amount}` })
        .where(eq(users.id, row.userId));
    }
    if (rows.length > 0) {
      await tx
        .update(wagerEscrows)
        .set({ status: "refunded", settledAt: new Date() })
        .where(inArray(wagerEscrows.id, rows.map((row) => row.id)));
    }
  });
}

/**
 * Safety net for a process restart: any hold left in the database belongs to
 * an in-memory room that no longer exists, so give the coins back.
 */
export async function refundPendingWagers(): Promise<number> {
  const rows = await db
    .select({ id: wagerEscrows.id })
    .from(wagerEscrows)
    .where(eq(wagerEscrows.status, "held"));
  if (rows.length === 0) return 0;
  await refundWager(rows.map((row) => row.id));
  return rows.length;
}
