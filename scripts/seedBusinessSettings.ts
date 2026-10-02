/**
 * Upsert platform business_settings required for checkout and core flows.
 * Usage: npx ts-node scripts/seedBusinessSettings.ts
 */
import dotenv from 'dotenv';
import prisma from '../src/config/database';

dotenv.config();

/** Keys that match production defaults from legacy Gizra (Aug 2026 backup). */
const DEFAULT_SETTINGS: Record<string, string> = {
  home_delivery: '1',
  take_away: '1',
  schedule_order: '1',
  instant_order: '1',
  repeat_order_option: '1',
  digital_payment: '{"status":"1"}',
  cash_on_delivery: '{"status":null}',
  guest_checkout_status: '0',
  wallet_status: '0',
  dm_tips_status: '1',
  order_delivery_verification: '1',
  order_confirmation_model: 'restaurant',
  admin_commission: '10',
  country: 'IL',
  currency: 'ILS',
  currency_symbol_position: 'left',
  timezone: 'Asia/Jerusalem',
  maintenance_mode: '0',
  toggle_veg_non_veg: '1',
  dm_maximum_orders: '5',
  dm_max_cash_in_hand: '10000',
  business_name: 'Gizra APP',
  language: '["en","he"]',
};

async function upsertSetting(key: string, value: string) {
  const existing = await prisma.business_settings.findFirst({ where: { key } });
  const now = new Date();
  if (existing) {
    await prisma.business_settings.update({
      where: { id: existing.id },
      data: { value, updated_at: now },
    });
    return 'updated';
  }
  await prisma.business_settings.create({
    data: { key, value, created_at: now, updated_at: now },
  });
  return 'created';
}

async function main() {
  let created = 0;
  let updated = 0;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const action = await upsertSetting(key, value);
    if (action === 'created') created += 1;
    else updated += 1;
  }
  console.log(`business_settings seed done (${created} created, ${updated} updated).`);
  console.log('Restart the API if it is already running (settings are cached in memory).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
