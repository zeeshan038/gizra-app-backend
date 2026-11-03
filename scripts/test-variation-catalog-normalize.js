/**
 * Production-safe (no ts-node). Run after `npm run build`.
 */
const {
  groupOptionsLookAbsolute,
  normalizeItemVariationsToAdditive,
  normalizeParsedMenuItem,
} = require('../dist/utils/vendor/variationCatalogNormalize');

let failed = 0;

function assert(name, ok, detail) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) failed = 1;
}

function optionAmount(o) {
  return Number(o.optionPrice ?? o.price ?? 0);
}

console.log('variationCatalogNormalize (dist)\n');

const pizza = normalizeItemVariationsToAdditive(45, [
  {
    name: 'Size',
    type: 'single',
    required: true,
    options: [
      { name: 'Personal', price: 45 },
      { name: 'Medium', price: 55 },
      { name: 'Large', price: 65 },
    ],
  },
]);
assert('pizza base stays 45', pizza.basePrice === 45, String(pizza.basePrice));
assert(
  'pizza sizes become 0/10/20',
  pizza.variations[0].options?.[0].price === 0 &&
    pizza.variations[0].options?.[1].price === 10 &&
    pizza.variations[0].options?.[2].price === 20,
  JSON.stringify(pizza.variations[0].options)
);

const toppings = normalizeItemVariationsToAdditive(30, [
  {
    name: 'Extras',
    type: 'multi',
    options: [
      { name: 'Cheese', price: 5 },
      { name: 'Olives', price: 3 },
    ],
  },
]);
assert(
  'toppings unchanged',
  toppings.variations[0].options?.[0].price === 5,
  JSON.stringify(toppings.variations)
);

const already = normalizeItemVariationsToAdditive(45, [
  {
    name: 'Size',
    type: 'single',
    options: [
      { name: 'Personal', price: 0 },
      { name: 'Medium', price: 10 },
    ],
  },
]);
assert(
  'already additive unchanged',
  already.variations[0].options?.[1].price === 10,
  JSON.stringify(already.variations)
);

const sauce = normalizeParsedMenuItem({
  price: 45,
  variations: [
    {
      name: 'Sauce',
      type: 'single',
      options: [
        { name: 'Normal', price: 45 },
        { name: 'Special', price: 46 },
      ],
    },
  ],
});
assert(
  'sauce 45/46 → 0/1',
  sauce.variations?.[0]?.options?.[0]?.price === 0 &&
    sauce.variations?.[0]?.options?.[1]?.price === 1,
  JSON.stringify(sauce.variations)
);

assert(
  'detect absolute sizes',
  groupOptionsLookAbsolute(45, [
    { name: 'M', price: 45 },
    { name: 'L', price: 55 },
  ]),
  'expected true'
);

const drinks = normalizeItemVariationsToAdditive(8, [
  {
    name: 'Drinks',
    type: 'multi',
    values: [
      { label: 'Cola', optionPrice: 8 },
      { label: 'Zero', optionPrice: 8 },
      { label: 'Sprite', optionPrice: 8 },
      { label: 'Tea', optionPrice: 8 },
      { label: 'DrP', optionPrice: 8 },
    ],
  },
]);
assert(
  '5 drink options at +8 must not become 0',
  Boolean(drinks.variations[0].values?.every((o) => optionAmount(o) === 8)),
  JSON.stringify(drinks.variations[0].values)
);

const drinksSix = normalizeItemVariationsToAdditive(8, [
  {
    name: 'Drinks',
    type: 'multi',
    values: [
      { label: 'Cola', optionPrice: 8 },
      { label: 'Zero', optionPrice: 8 },
      { label: 'Sprite', optionPrice: 8 },
      { label: 'Tea', optionPrice: 8 },
      { label: 'DrP', optionPrice: 8 },
      { label: 'Soda', optionPrice: 0 },
    ],
  },
]);
assert(
  '6th option at 0 must not zero the other drink prices',
  drinksSix.variations[0].values?.filter((o) => optionAmount(o) === 8).length === 5 &&
    drinksSix.variations[0].values?.some((o) => optionAmount(o) === 0),
  JSON.stringify(drinksSix.variations[0].values)
);

assert(
  'flat +8 options are not absolute tiers',
  groupOptionsLookAbsolute(8, [
    { label: 'A', optionPrice: 8 },
    { label: 'B', optionPrice: 8 },
  ]) === false,
  'expected false'
);

console.log(failed ? '\nFAILED' : '\nPASSED');
process.exit(failed);
