// lib/spaceCode.ts
export function normalizeSpaceCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateSpaceCode(length = 6) {
  // Unngå O/0 og I/1 for lesbarhet
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

  // Format: ABC123 (3 bokstaver + 3 tall)
  const a = Array.from({ length: 3 }, () => pick(letters)).join("");
  const b = Array.from({ length: 3 }, () => pick(digits)).join("");
  return `${a}${b}`;
}
