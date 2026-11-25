import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { GameRules } from "@stacked/shared";
import type { CosmeticSlot } from "@stacked/shared";

export type Loadout = Record<CosmeticSlot, string>;

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 24 }).notNull(),
    displayName: varchar("display_name", { length: 24 }).notNull(),
    /** Toggled by hand in the database. Grants owner-only cosmetics + badge. */
    isOwner: boolean("is_owner").notNull().default(false),
    /** Toggled from the owner console. Grants beta-tester cosmetics + badge. */
    isBetaTester: boolean("is_beta_tester").notNull().default(false),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    bannedBy: varchar("banned_by", { length: 24 }),
    passwordHash: text("password_hash").notNull(),
    xp: integer("xp").notNull().default(0),
    coins: integer("coins").notNull().default(250),
    wins: integer("wins").notNull().default(0),
    games: integer("games").notNull().default(0),
    jumps: integer("jumps").notNull().default(0),
    stacks: integer("stacks").notNull().default(0),
    cardsPlayed: integer("cards_played").notNull().default(0),
    /** sha256 of the one-time recovery code. The raw code is shown once. */
    recoveryHash: varchar("recovery_hash", { length: 64 }),
    recoveryIssuedAt: timestamp("recovery_issued_at", { withTimezone: true }),
    equipped: jsonb("equipped")
      .$type<Loadout>()
      .notNull()
      .default({
        cardBack: "midnight",
        table: "noir",
        avatar: "rook",
        nameEffect: "plain",
        winEffect: "none",
      }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_username_uq").on(sql`lower(${table.username})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token — the raw token is never stored. */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestName: varchar("guest_name", { length: 24 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const userCosmetics = pgTable(
  "user_cosmetics",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: varchar("item_id", { length: 40 }).notNull(),
    source: varchar("source", { length: 20 }).notNull().default("unlock"),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] })],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomCode: varchar("room_code", { length: 8 }).notNull(),
    playerCount: integer("player_count").notNull(),
    winnerId: uuid("winner_id").references(() => users.id, { onDelete: "set null" }),
    winnerName: varchar("winner_name", { length: 24 }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    rules: jsonb("rules").$type<GameRules>().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("matches_ended_idx").on(table.endedAt)],
);

export const matchPlayers = pgTable(
  "match_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: varchar("display_name", { length: 24 }).notNull(),
    isBot: boolean("is_bot").notNull().default(false),
    placement: integer("placement").notNull(),
    cardsLeft: integer("cards_left").notNull(),
    coins: integer("coins").notNull().default(0),
    xp: integer("xp").notNull().default(0),
  },
  (table) => [index("match_players_match_idx").on(table.matchId), index("match_players_user_idx").on(table.userId)],
);

export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: varchar("actor_name", { length: 24 }).notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    targetId: uuid("target_id").references(() => users.id, { onDelete: "set null" }),
    targetName: varchar("target_name", { length: 24 }),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("admin_audit_created_idx").on(table.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
