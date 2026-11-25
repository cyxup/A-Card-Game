/** A name that is safe to render, store and show at a table. */
export function cleanDisplayName(raw: unknown, max = 20): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .normalize("NFC")
    // strip control and Unicode format chars (bidi overrides, zero-width joiners…)
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
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
