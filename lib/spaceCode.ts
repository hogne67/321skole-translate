// lib/spaceCode.ts
export function normalizeSpaceCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateSpaceCode(length = 6) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

  const n = Math.max(4, Math.min(12, Math.floor(length))); // litt sane bounds
  const lettersCount = Math.floor(n / 2);
  const digitsCount = n - lettersCount;

  const a = Array.from({ length: lettersCount }, () => pick(letters)).join("");
  const b = Array.from({ length: digitsCount }, () => pick(digits)).join("");
  return `${a}${b}`;
}
