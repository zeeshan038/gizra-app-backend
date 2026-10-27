import prisma from '../../../config/database';

/** Mirrors PHP `check_status` on parent disbursement batch. */
export async function syncParentDisbursementStatus(disbursementId: number): Promise<void> {
  const rows = await prisma.disbursement_details.findMany({
    where: { disbursement_id: disbursementId },
    select: { status: true },
  });
  if (!rows.length) return;

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    const s = r.status ?? 'pending';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const total = rows.length;
  let status = 'partially_completed';
  if (counts.pending === total) status = 'pending';
  else if (counts.canceled === total) status = 'canceled';
  else if (counts.completed === total) status = 'completed';

  await prisma.disbursements.update({
    where: { id: BigInt(disbursementId) },
    data: { status, updated_at: new Date() },
  });
}
