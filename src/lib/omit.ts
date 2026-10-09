/** Returns a shallow copy of `obj` without the given keys. */
export function omit<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T {
  const result = { ...obj };
  for (const key of keys) delete result[key];
  return result;
}
