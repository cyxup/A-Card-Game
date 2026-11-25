import { ownerCardFromSpec, isValidOwnerCardSpec, type Card, type OwnerCardSpec } from "@stacked/shared";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminAudit, users } from "../db/schema.js";

export class OwnerToolError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 403) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Never trust `conn.principal.user.isOwner`: that snapshot lives as long as
 * the socket. Every owner action re-reads the flag from PostgreSQL, so removing
 * `is_owner` takes effect immediately, even mid-game.
 */
export async function assertLiveOwner(userId: string): Promise<void> {
  const [row] = await db
    .select({ isOwner: users.isOwner, banned: users.banned })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.banned || !row.isOwner) {
    throw new OwnerToolError("owner_only", "Owner tools are not available.", 403);
  }
}

export function makeOwnerCard(spec: OwnerCardSpec): Card {
  if (!isValidOwnerCardSpec(spec)) {
    throw new OwnerToolError("invalid_card", "That card is not valid.", 400);
  }
  // Fresh id: never collide with a card still in a hand, the deck or the pile.
  return ownerCardFromSpec(spec, `owner-${randomUUID()}`);
}

export function cardSpec(card: Card): OwnerCardSpec & { id: string } {
  return { id: card.id, color: card.color, kind: card.kind, value: card.value };
}

export async function auditOwnerCheat(
  actor: { id: string; username: string },
  detail: Record<string, unknown>,
): Promise<void> {
  await db.insert(adminAudit).values({
    actorId: actor.id,
    actorName: actor.username,
    action: "owner_cheat",
    targetId: actor.id,
    targetName: actor.username,
    detail,
  });
}
