#!/usr/bin/env node
/**
 * Seed admin legal pages into data_settings (PHP: Business Settings → Pages).
 * Run if GET /api/pages/* returns empty content.
 *
 *   node scripts/seed-legal-pages.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TYPE = 'admin_landing_page';

const PAGES = [
  {
    key: 'terms_and_conditions',
    value:
      '<h2>Terms and conditions</h2><p>Update this text in Admin → Business Settings → Pages → Terms and conditions.</p>',
  },
  {
    key: 'privacy_policy',
    value:
      '<h2>Privacy policy</h2><p>Update this text in Admin → Business Settings → Pages → Privacy policy.</p>',
  },
  {
    key: 'about_us',
    value: '<h2>About us</h2><p>About Gizra.</p>',
  },
  {
    key: 'refund_policy',
    value: '<h2>Refund policy</h2><p>Refund policy content.</p>',
  },
  {
    key: 'shipping_policy',
    value: '<h2>Shipping policy</h2><p>Shipping policy content.</p>',
  },
  {
    key: 'cancellation_policy',
    value: '<h2>Cancellation policy</h2><p>Cancellation policy content.</p>',
  },
  {
    key: 'refund_policy_status',
    value: '1',
  },
  {
    key: 'shipping_policy_status',
    value: '0',
  },
  {
    key: 'cancellation_policy_status',
    value: '0',
  },
];

async function upsertPage(key, value) {
  const existing = await prisma.data_settings.findFirst({
    where: { key, type: TYPE },
  });
  const now = new Date();
  if (existing) {
    if (existing.value?.trim()) {
      console.log(`skip ${key} (already has content)`);
      return;
    }
    await prisma.data_settings.update({
      where: { id: existing.id },
      data: { value, updated_at: now },
    });
    console.log(`updated ${key}`);
    return;
  }
  await prisma.data_settings.create({
    data: { key, value, type: TYPE, created_at: now, updated_at: now },
  });
  console.log(`created ${key}`);
}

(async () => {
  for (const p of PAGES) {
    await upsertPage(p.key, p.value);
  }
  console.log('\nDone. Retry GET /api/pages/terms-and-conditions');
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
