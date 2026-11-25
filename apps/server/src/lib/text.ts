/** A name that is safe to render, store and show at a table. */
export function cleanDisplayName(raw: unknown, max = 20): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    // strip control chars and zero-width joiner tricks
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  if (name.length < 2) return null;
  return name;
}

export function cleanUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const username = raw.trim().toLowerCase();
  return /^[a-z0-9_]{3,16}$/.test(username) ? username : null;
}
