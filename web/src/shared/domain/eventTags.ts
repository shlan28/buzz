export function firstTag(tags: string[][], name: string): string | undefined {
  return tags.find((tag) => tag[0] === name)?.[1];
}

export function semanticTag(
  tags: string[][],
  prefix: string,
): string | undefined {
  return tags
    .filter((tag) => tag[0] === "t")
    .map((tag) => tag[1] ?? "")
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

export function latestByCoordinate<T extends { id: string; updatedAt: number }>(
  values: T[],
): T[] {
  const latest = new Map<string, T>();
  for (const value of values) {
    const previous = latest.get(value.id);
    if (!previous || previous.updatedAt < value.updatedAt)
      latest.set(value.id, value);
  }
  return [...latest.values()];
}
