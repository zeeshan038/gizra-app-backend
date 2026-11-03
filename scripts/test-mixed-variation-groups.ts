/**
 * Multi + multiple single choice groups must keep all option rows in consumer menu shape.
 * Run: npm run test:mixed-variation-groups
 */
import { variationsForMobileClient } from '../src/utils/consumer/variationsForMobileClient';
import {
  sanitizeVariationGroupsForStorage,
} from '../src/utils/consumer/variationGroupOptions';
import { normalizeItemVariationsToAdditive } from '../src/utils/vendor/variationCatalogNormalize';

function assert(name: string, ok: boolean, detail: string) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

function valueCount(group: Record<string, unknown>): number {
  const values = group.values;
  return Array.isArray(values) ? values.length : 0;
}

console.log('Mixed variation groups (multi + 2× single)\n');

const panelSaved = [
  {
    name: 'Extras',
    type: 'multi',
    required: true,
    min: '0',
    max: '999',
    selectionMode: 'standard',
    values: [
      { label: 'Mushroom', optionPrice: 5, price: 5 },
      { label: 'Olives', optionPrice: 3, price: 3 },
    ],
  },
  {
    name: 'Crust',
    type: 'single',
    required: true,
    min: '0',
    max: '1',
    values: [
      { label: 'Thin', optionPrice: 0, price: 0 },
      { label: 'Thick', optionPrice: 5, price: 5 },
    ],
  },
  {
    name: 'Drink',
    type: 'single',
    required: false,
    min: '0',
    max: '1',
    values: [
      { label: 'None', optionPrice: 0, price: 0 },
      { label: 'Cola', optionPrice: 8, price: 8 },
    ],
  },
];

const priced = normalizeItemVariationsToAdditive(50, panelSaved);
const mobile = variationsForMobileClient(priced.basePrice, priced.variations) as Record<
  string,
  unknown
>[];

assert('three groups on menu API', mobile.length === 3, `got ${mobile.length}`);
assert(
  'multi group keeps both options',
  valueCount(mobile[0]) === 2,
  JSON.stringify(mobile[0]?.values)
);
assert(
  'first single keeps both options',
  valueCount(mobile[1]) === 2,
  JSON.stringify(mobile[1]?.values)
);
assert(
  'second single keeps both options',
  valueCount(mobile[2]) === 2,
  JSON.stringify(mobile[2]?.values)
);

/** Prefer non-empty options when values is an empty array (legacy/partial saves). */
const legacyEmptyValues = [
  {
    name: 'Extras',
    type: 'multi',
    max: '999',
    values: [],
    options: [
      { label: 'Mushroom', optionPrice: 5 },
      { label: 'Olives', optionPrice: 3 },
    ],
  },
  {
    name: 'Size',
    type: 'single',
    max: '1',
    values: [{ label: 'Large', optionPrice: 0 }],
  },
  {
    name: 'Crust',
    type: 'single',
    max: '1',
    values: [{ label: 'Thin', optionPrice: 0 }],
  },
];

const mobileLegacy = variationsForMobileClient(40, legacyEmptyValues) as Record<string, unknown>[];
assert(
  'empty values[] falls back to options[] for multi',
  valueCount(mobileLegacy[0]) === 2,
  JSON.stringify(mobileLegacy[0])
);

const sanitized = sanitizeVariationGroupsForStorage(legacyEmptyValues);
assert(
  'sanitize coalesces options into values for storage',
  Array.isArray(sanitized[0]?.values) && (sanitized[0].values as unknown[]).length === 2,
  JSON.stringify(sanitized[0])
);
assert(
  'sanitize drops legacy options key',
  sanitized[0]?.options === undefined,
  JSON.stringify(Object.keys(sanitized[0] || {}))
);

console.log('');
