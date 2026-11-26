import type { UserTagView } from "@stacked/shared";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { tags, userTags } from "../db/schema.js";

type TagRow = { userId: string; id: string; name: string; color: string };

function groupRows(rows: TagRow[]): Map<string, UserTagView[]> {
  const byUser = new Map<string, UserTagView[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    byUser.set(row.userId, list);
  }
  return byUser;
}

export async function tagMapForUsers(ids: string[]): Promise<Map<string, UserTagView[]>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      userId: userTags.userId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(userTags)
    .innerJoin(tags, eq(userTags.tagId, tags.id))
    .where(inArray(userTags.userId, unique))
    .orderBy(tags.name);
  return groupRows(rows);
}

export async function tagsForUser(userId: string): Promise<UserTagView[]> {
  return (await tagMapForUsers([userId])).get(userId) ?? [];
}

/**
 * Room views are built synchronously on every game tick, so keep a small
 * in-memory cache for seat labels. The admin console refreshes it when tags
 * are assigned or deleted.
 */
let cache = new Map<string, UserTagView[]>();

export async function warmTagCache(): Promise<void> {
  const rows = await db
    .select({
      userId: userTags.userId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(userTags)
    .innerJoin(tags, eq(userTags.tagId, tags.id))
    .orderBy(tags.name);
  cache = groupRows(rows);
}

export async function refreshUserTagCache(userId: string): Promise<void> {
  cache.set(userId, await tagsForUser(userId));
}

export function tagsForUserSync(userId: string | null | undefined): UserTagView[] {
  if (!userId) return [];
  return cache.get(userId) ?? [];
}
