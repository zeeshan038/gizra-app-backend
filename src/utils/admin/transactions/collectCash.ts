import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import {
  computeRestaurantWalletBalance,
  computeWithdrawableEarning,
  decimalToNumber,
  roundMoney,
  toDecimal,
} from '../../vendor/walletHelpers';

function dec(value: number | string | bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

async function getOrCreateAdminWallet(tx: Prisma.TransactionClient) {
  const admin = await tx.admins.findFirst({
    where: { role_id: dec(1) },
    select: { id: true },
  });
  if (!admin) return null;
  const adminId = dec(admin.id);
  const existing = await tx.admin_wallets.findFirst({ where: { admin_id: adminId } });
  if (existing) return existing;
  return tx.admin_wallets.create({
    data: { admin_id: adminId, created_at: new Date(), updated_at: new Date() },
  });
}

export async function searchCollectCashAccounts(type: 'restaurant' | 'deliveryman', search?: string) {
  const q = search?.trim();
  if (type === 'restaurant') {
    const rows = await prisma.restaurants.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      take: 20,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true, zone_id: true },
    });
    const zoneIds = [
      ...new Set(
        rows
          .map((r) => (r.zone_id != null ? Number(r.zone_id) : NaN))
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    ];
    const zones = zoneIds.length
      ? await prisma.zones.findMany({
          where: { id: { in: zoneIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];
    const zoneMap = new Map(zones.map((z) => [Number(z.id), z.name]));
    return rows.map((r) => {
      const zid = r.zone_id != null ? Number(r.zone_id) : null;
      const zoneName = zid != null ? zoneMap.get(zid) : null;
      return {
        id: Number(r.id),
        label: zoneName ? `${r.name} (${zoneName})` : r.name,
        phone: r.phone,
      };
    });
  }

  const rows = await prisma.delivery_men.findMany({
    where: {
      status: true,
      ...(q
        ? {
            OR: [
              { f_name: { contains: q, mode: 'insensitive' } },
              { l_name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    take: 20,
    orderBy: { f_name: 'asc' },
    select: { id: true, f_name: true, l_name: true, phone: true },
  });
  return rows.map((r) => ({
    id: Number(r.id),
    label: `${r.f_name ?? ''} ${r.l_name ?? ''}`.trim() || `DM #${r.id}`,
    phone: r.phone,
  }));
}

export async function getCollectCashAccountData(type: 'restaurant' | 'deliveryman', id: number) {
  if (type === 'restaurant') {
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, name: true, vendor_id: true },
    });
    if (!restaurant) throw new Error('Restaurant not found');
    const wallet = await prisma.restaurant_wallets.findFirst({
      where: { vendor_id: restaurant.vendor_id },
    });
    const totalEarning = decimalToNumber(wallet?.total_earning);
    const totalWithdrawn = decimalToNumber(wallet?.total_withdrawn);
    const pendingWithdraw = decimalToNumber(wallet?.pending_withdraw);
    const collectedCash = decimalToNumber(wallet?.collected_cash);
    return {
      id: Number(restaurant.id),
      name: restaurant.name,
      cash_in_hand: roundMoney(collectedCash),
      earning_balance: roundMoney(
        Math.max(
          0,
          computeRestaurantWalletBalance({
            total_earning: totalEarning,
            total_withdrawn: totalWithdrawn,
            pending_withdraw: pendingWithdraw,
            collected_cash: collectedCash,
          })
        )
      ),
    };
  }

  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(id) },
    select: { id: true, f_name: true, l_name: true },
  });
  if (!dm) throw new Error('Delivery man not found');
  const wallet = await prisma.delivery_man_wallets.findFirst({
    where: { delivery_man_id: dec(id) },
  });
  const totalEarning = decimalToNumber(wallet?.total_earning);
  const totalWithdrawn = decimalToNumber(wallet?.total_withdrawn);
  const pendingWithdraw = decimalToNumber(wallet?.pending_withdraw);
  const collectedCash = decimalToNumber(wallet?.collected_cash);
  return {
    id: Number(dm.id),
    name: `${dm.f_name ?? ''} ${dm.l_name ?? ''}`.trim(),
    cash_in_hand: roundMoney(collectedCash),
    earning_balance: roundMoney(
      Math.max(
        0,
        computeWithdrawableEarning({
          total_earning: totalEarning,
          total_withdrawn: totalWithdrawn,
          pending_withdraw: pendingWithdraw,
        })
      )
    ),
  };
}

export type CollectCashInput = {
  type: 'restaurant' | 'deliveryman';
  restaurant_id?: number;
  deliveryman_id?: number;
  amount: number;
  method: string;
  ref?: string | null;
};

export async function collectCash(input: CollectCashInput) {
  const amount = roundMoney(Number(input.amount));
  if (!(amount > 0)) throw new Error('Amount must be greater than 0');

  if (input.type === 'restaurant' && input.deliveryman_id) {
    throw new Error('Cannot provide both restaurant and deliveryman');
  }
  if (input.type === 'deliveryman' && input.restaurant_id) {
    throw new Error('Cannot provide both restaurant and deliveryman');
  }

  return prisma.$transaction(async (tx) => {
    let fromId: number;
    let currentBalance: number;

    if (input.type === 'restaurant') {
      const restaurantId = Number(input.restaurant_id);
      if (!Number.isFinite(restaurantId)) throw new Error('restaurant_id is required');
      const restaurant = await tx.restaurants.findUnique({
        where: { id: BigInt(restaurantId) },
        select: { vendor_id: true },
      });
      if (!restaurant) throw new Error('Restaurant not found');
      fromId = Number(restaurant.vendor_id);
      let wallet = await tx.restaurant_wallets.findFirst({
        where: { vendor_id: restaurant.vendor_id },
      });
      if (!wallet) {
        wallet = await tx.restaurant_wallets.create({
          data: {
            vendor_id: restaurant.vendor_id,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      }
      currentBalance = decimalToNumber(wallet.collected_cash);
      if (currentBalance < amount) throw new Error('Insufficient balance');
      await tx.restaurant_wallets.update({
        where: { id: wallet.id },
        data: {
          collected_cash: { decrement: toDecimal(amount) },
          updated_at: new Date(),
        },
      });
    } else {
      const dmId = Number(input.deliveryman_id);
      if (!Number.isFinite(dmId)) throw new Error('deliveryman_id is required');
      const dm = await tx.delivery_men.findUnique({ where: { id: BigInt(dmId) }, select: { id: true } });
      if (!dm) throw new Error('Delivery man not found');
      fromId = dmId;
      let wallet = await tx.delivery_man_wallets.findFirst({
        where: { delivery_man_id: dec(dmId) },
      });
      if (!wallet) {
        wallet = await tx.delivery_man_wallets.create({
          data: {
            delivery_man_id: dec(dmId),
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      }
      currentBalance = decimalToNumber(wallet.collected_cash);
      if (currentBalance < amount) throw new Error('Insufficient balance');
      await tx.delivery_man_wallets.update({
        where: { id: wallet.id },
        data: {
          collected_cash: { decrement: toDecimal(amount) },
          updated_at: new Date(),
        },
      });
    }

    const now = new Date();
    const row = await tx.account_transactions.create({
      data: {
        from_type: input.type,
        from_id: dec(fromId),
        current_balance: toDecimal(currentBalance),
        amount: toDecimal(amount),
        method: input.method,
        ref: input.ref ?? null,
        type: 'collected',
        created_by: 'admin',
        created_at: now,
        updated_at: now,
      },
    });

    const adminWallet = await getOrCreateAdminWallet(tx);
    if (adminWallet) {
      await tx.admin_wallets.update({
        where: { id: adminWallet.id },
        data: {
          manual_received: { increment: toDecimal(amount) },
          updated_at: now,
        },
      });
    }

    return {
      id: Number(row.id),
      from_type: input.type,
      from_id: fromId,
      amount,
      method: input.method,
      ref: input.ref ?? null,
      current_balance: currentBalance,
    };
  });
}

export async function listCollectCashTransactions(params: {
  search?: string;
  page: number;
  limit: number;
}) {
  const skip = (params.page - 1) * params.limit;
  const where: Prisma.account_transactionsWhereInput = {
    type: 'collected',
    created_by: 'admin',
    ...(params.search
      ? {
          OR: [
            { method: { contains: params.search, mode: 'insensitive' } },
            { ref: { contains: params.search, mode: 'insensitive' } },
            { from_type: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.account_transactions.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: params.limit,
    }),
    prisma.account_transactions.count({ where }),
  ]);

  const vendorIds = rows
    .filter((r) => r.from_type === 'restaurant')
    .map((r) => Number(r.from_id));
  const dmIds = rows
    .filter((r) => r.from_type === 'deliveryman')
    .map((r) => Number(r.from_id));

  const [vendors, restaurants, dms] = await Promise.all([
    vendorIds.length
      ? prisma.vendors.findMany({
          where: { id: { in: vendorIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true },
        })
      : [],
    vendorIds.length
      ? prisma.restaurants.findMany({
          where: { vendor_id: { in: vendorIds } },
          select: { vendor_id: true, name: true },
        })
      : [],
    dmIds.length
      ? prisma.delivery_men.findMany({
          where: { id: { in: dmIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true },
        })
      : [],
  ]);

  const vendorName = new Map(
    vendors.map((v) => [Number(v.id), `${v.f_name ?? ''} ${v.l_name ?? ''}`.trim()])
  );
  const restName = new Map(restaurants.map((r) => [Number(r.vendor_id), r.name]));
  const dmName = new Map(
    dms.map((d) => [Number(d.id), `${d.f_name ?? ''} ${d.l_name ?? ''}`.trim()])
  );

  return {
    total,
    data: rows.map((r, index) => {
      const fromId = Number(r.from_id);
      const name =
        r.from_type === 'restaurant'
          ? restName.get(fromId) || vendorName.get(fromId) || `#${fromId}`
          : dmName.get(fromId) || `#${fromId}`;
      return {
        id: Number(r.id),
        sl: skip + index + 1,
        date: r.created_at,
        type: r.from_type,
        name,
        amount: decimalToNumber(r.amount),
        method: r.method,
        reference: r.ref,
        current_balance: decimalToNumber(r.current_balance),
      };
    }),
  };
}
