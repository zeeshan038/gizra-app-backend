import prisma from '../../../config/database';

export async function syncRestaurantTags(restaurantId: number, tagLabels: string[]) {
  const labels = [...new Set(tagLabels.map((t) => t.trim()).filter(Boolean))];
  if (!labels.length) return;

  const tagIds: bigint[] = [];
  const now = new Date();

  for (const label of labels) {
    let tag = await prisma.tags.findFirst({ where: { tag: label } });
    if (!tag) {
      tag = await prisma.tags.create({
        data: { tag: label, created_at: now, updated_at: now },
      });
    }
    tagIds.push(tag.id);
  }

  await prisma.restaurant_tag.createMany({
    data: tagIds.map((tag_id) => ({
      restaurant_id: restaurantId,
      tag_id: Number(tag_id),
    })),
    skipDuplicates: true,
  });
}
