export class LessonError extends Error {
  constructor(message: string, public readonly status: 400 | 401 | 403) {
    super(message);
    this.name = "LessonError";
  }
}

export function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LessonError(`${field} must be an object.`, 400);
  }
  return value as Record<string, unknown>;
}

export function onlyKeys(value: Record<string, unknown>, keys: readonly string[], field: string) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new LessonError(`${field}.${key} is not supported.`, 400);
  }
}

export function stringField(value: unknown, field: string, max: number, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") throw new LessonError(`${field} must be a string.`, 400);
  const result = value.trim();
  if (result.length > max) throw new LessonError(`${field} is too long.`, 400);
  return result;
}

export function requiredString(value: unknown, field: string, max: number): string {
  const result = stringField(value, field, max);
  if (!result) throw new LessonError(`${field} is required.`, 400);
  return result;
}
