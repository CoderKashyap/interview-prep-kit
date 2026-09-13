export function nextId(prefix: string, existing: string[]): string {
  const used = new Set(existing);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function allocateIds(prefix: string, count: number, existing: string[] = []): string[] {
  const ids: string[] = [];
  const used = new Set(existing);
  let n = 1;
  while (ids.length < count) {
    const id = `${prefix}${n}`;
    if (!used.has(id)) {
      ids.push(id);
      used.add(id);
    }
    n += 1;
  }
  return ids;
}
