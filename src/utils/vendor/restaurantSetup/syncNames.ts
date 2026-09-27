export async function syncRestaurantRelationNames(
  names: string[],
  findOrCreate: (name: string) => Promise<bigint>,
  replaceLinks: (ids: bigint[]) => Promise<void>
) {
  const ids: bigint[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    ids.push(await findOrCreate(name));
  }
  await replaceLinks(ids);
}
