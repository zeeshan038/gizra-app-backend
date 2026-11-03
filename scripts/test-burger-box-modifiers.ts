/**
 * Burger Box: opt-out included ingredients + capped paid upgrades on one product.
 * Run: npm run test:burger-box-modifiers
 */
import { resolveCheckoutServerUnitBase } from '../src/utils/consumer/checkoutFoodUnitPrice';
import { computeVariationExtra } from '../src/utils/consumer/variationPricing';
import {
  BURGER_BOX_DUMMY_VARIATIONS,
  UNLIMITED_MODIFIER_MAX,
} from '../src/utils/consumer/variationModifierGroups';
import { variationsForMobileClient } from '../src/utils/consumer/variationsForMobileClient';

function assert(name: string, ok: boolean, detail: string) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

const BASE = 59;
const rawJson = JSON.stringify(BURGER_BOX_DUMMY_VARIATIONS);

console.log('Burger Box modifier groups\n');

const mobile = variationsForMobileClient(BASE, BURGER_BOX_DUMMY_VARIATIONS) as Record<
  string,
  unknown
>[];

assert('two groups after mobile transform', mobile.length === 2, `got ${mobile.length}`);

const removeGroup = mobile[0] as Record<string, unknown>;
const upgradeGroup = mobile[1] as Record<string, unknown>;

assert(
  'remove group opt_out + pre-select',
  removeGroup.selectionMode === 'opt_out' && removeGroup.defaultSelectAll === true,
  JSON.stringify({ mode: removeGroup.selectionMode, def: removeGroup.defaultSelectAll })
);
assert(
  'remove group unlimited max (not capped with upgrades)',
  removeGroup.max === UNLIMITED_MODIFIER_MAX,
  `got max=${removeGroup.max}`
);
assert(
  'upgrade group opt_in max 4',
  upgradeGroup.selectionMode === 'opt_in' &&
    upgradeGroup.max === '4' &&
    upgradeGroup.defaultSelectAll === false,
  JSON.stringify({
    mode: upgradeGroup.selectionMode,
    max: upgradeGroup.max,
    def: upgradeGroup.defaultSelectAll,
  })
);

const removeValues = removeGroup.values as Record<string, unknown>[];
assert(
  'included ingredients tagged (not FREE)',
  removeValues.every(
    (o) => o.priceTag === 'included' && o.showPrice === false && Number(o.optionPrice) === 0
  ),
  JSON.stringify(removeValues)
);

const selected = [
  {
    name: 'Ingredients to Remove',
    values: { label: ['Asado'] },
  },
  {
    name: 'Paid Upgrades',
    values: { label: ['Extra Cheese', 'Egg'] },
  },
];

const extra = computeVariationExtra(rawJson, selected);
assert('variation extra = paid upgrades only (5+4=9)', extra === 9, `got ${extra}`);

const unit = resolveCheckoutServerUnitBase({
  catalogBasePrice: BASE,
  productVariationsJson: rawJson,
  selectedVariations: selected,
});
assert('checkout unit = base + upgrades (68)', unit === 68, `got ${unit}`);

/** Simultaneous max=4 on upgrades must not shrink remove group when both saved from panel shape. */
const panelSaved = [
  {
    name: 'Ingredients to Remove',
    type: 'multi',
    selectionMode: 'opt_out',
    defaultSelectAll: true,
    min: '0',
    max: UNLIMITED_MODIFIER_MAX,
    values: [
      { label: 'Asado', optionPrice: 0 },
      { label: 'Onion', optionPrice: 0 },
    ],
  },
  {
    name: 'Paid Upgrades',
    type: 'multi',
    selectionMode: 'opt_in',
    min: '0',
    max: '4',
    values: [
      { label: 'Extra Cheese', optionPrice: 5 },
      { label: 'Egg', optionPrice: 4 },
      { label: 'Bacon', optionPrice: 6 },
      { label: 'Avocado', optionPrice: 7 },
      { label: 'Jalapeño', optionPrice: 3 },
    ],
  },
];

const mobile2 = variationsForMobileClient(BASE, panelSaved) as Record<string, unknown>[];
assert(
  'panel-shaped JSON keeps remove max 999 and upgrade max 4',
  (mobile2[0] as Record<string, unknown>).max === UNLIMITED_MODIFIER_MAX &&
    (mobile2[1] as Record<string, unknown>).max === '4',
  JSON.stringify(mobile2.map((g) => ({ name: g.name, max: g.max })))
);

console.log('');
