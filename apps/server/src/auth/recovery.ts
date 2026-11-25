import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Human-friendly recovery codes. 25 characters from a 32-symbol alphabet is
 * ~125 bits of entropy; the server only ever stores the SHA-256 digest.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUPS = 5;
const GROUP_SIZE = 5;

export function generateRecoveryCode(): string {
  const bytes = randomBytes(GROUPS * GROUP_SIZE);
  const chars: string[] = [];
  for (const byte of bytes) {
    chars.push(ALPHABET[byte % ALPHABET.length] as string);
  }
  let code = "";
  for (let group = 0; group < GROUPS; group++) {
    if (group > 0) code += "-";
    code += chars.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE).join("");
  }
  return code;
}

export function normaliseRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, GROUPS * GROUP_SIZE);
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseRecoveryCode(code)).digest("hex");
}

export function recoveryMatches(input: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashRecoveryCode(input), "hex");
  const expected = Buffer.from(storedHash, "hex");
  if (candidate.length !== expected.length || expected.length === 0) return false;
  return timingSafeEqual(candidate, expected);
}
