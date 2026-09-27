import prisma from '../../../config/database';

let manualDispatchColumnReady = false;

async function ensureManualDispatchColumn() {
  if (manualDispatchColumnReady) return true;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS manual_dispatch BOOLEAN NOT NULL DEFAULT false`
    );
    manualDispatchColumnReady = true;
    return true;
  } catch {
    return false;
  }
}

export async function readManualDispatch(restaurantId: bigint) {
  const read = async () => {
    const rows = await prisma.$queryRaw<Array<{ manual_dispatch: boolean | null }>>`
      SELECT manual_dispatch FROM restaurants WHERE id = ${restaurantId}
    `;
    manualDispatchColumnReady = true;
    return Boolean(rows[0]?.manual_dispatch);
  };

  try {
    return await read();
  } catch {
    const created = await ensureManualDispatchColumn();
    if (!created) return null;
    try {
      return await read();
    } catch {
      return null;
    }
  }
}

export async function writeManualDispatch(restaurantId: bigint, status: boolean) {
  await prisma.$executeRaw`
    UPDATE restaurants SET manual_dispatch = ${status}, updated_at = NOW() WHERE id = ${restaurantId}
  `;
}
