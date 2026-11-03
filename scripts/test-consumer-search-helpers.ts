/**
 * Run: npx ts-node scripts/test-consumer-search-helpers.ts
 * Optional: SEARCH_NAME="Pizza" ZONE_ID=2 npx ts-node scripts/test-consumer-search-helpers.ts
 */
import {
  findRestaurantIdsForConsumerSearch,
  parseConsumerSearchQuery,
  tokenizeSearchQuery,
} from '../src/utils/consumer/restaurantSearchHelpers';
import { Request } from 'express';

function assert(name: string, ok: boolean, detail: string) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

console.log('Consumer search helpers\n');

assert('tokenize single word', tokenizeSearchQuery('Burger')?.[0] === 'Burger', '');
assert(
  'tokenize multi-word',
  tokenizeSearchQuery('  Pizza   Hut  ').join(',') === 'Pizza,Hut',
  tokenizeSearchQuery('  Pizza   Hut  ').join(',')
);

const mockReq = {
  query: { search: 'test-query' },
} as unknown as Request;
assert('parse search alias', parseConsumerSearchQuery(mockReq) === 'test-query', '');

const liveName = process.env.SEARCH_NAME?.trim();
const zoneRaw = process.env.ZONE_ID;
if (liveName && zoneRaw) {
  const zoneIds = zoneRaw.split(',').map((z) => Number(z.trim())).filter(Number.isFinite);
  const tokens = tokenizeSearchQuery(liveName);
  findRestaurantIdsForConsumerSearch(tokens, zoneIds, liveName)
    .then((ids) => {
      console.log(`\nDB lookup "${liveName}" zone ${zoneIds.join(',')}: ${ids.length} restaurant(s)`);
      if (ids.length) console.log('  ids:', ids.slice(0, 20).join(', '));
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
} else {
  console.log('\n(Set SEARCH_NAME and ZONE_ID to run a live DB lookup.)');
}
