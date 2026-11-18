/**
 * Quick unit checks for multi-slot combo helpers (no DB).
 * Run: npx ts-node scripts/test-combo-slots.ts
 */
import assert from 'assert';
import {
  buildComboSlotLabels,
  comboDefinitionForClient,
  flattenComboSelectionsForKitchen,
  parseComboDefinition,
  validateComboSelections,
} from '../src/utils/consumer/comboDefinition';
import { computeComboVariationExtra } from '../src/utils/consumer/checkoutFoodUnitPrice';

const def = parseComboDefinition({
  enabled: true,
  slot_count: 4,
  slot_label: 'Burger',
});
assert.ok(def);
assert.deepStrictEqual(buildComboSlotLabels(def!), [
  'Burger #1',
  'Burger #2',
  'Burger #3',
  'Burger #4',
]);

const client = comboDefinitionForClient(JSON.stringify(def));
assert.equal(client?.slot_count, 4);
assert.equal((client?.steps as unknown[])?.length, 4);

const template = JSON.stringify([
  {
    name: 'Doneness',
    type: 'single',
    required: true,
    values: [
      { label: 'Medium', optionPrice: 0 },
      { label: 'Well', optionPrice: 0 },
    ],
  },
  {
    name: 'Paid Upgrades',
    type: 'multi',
    required: false,
    selectionMode: 'opt_in',
    max: '4',
    values: [
      { label: 'Cheese', optionPrice: 5 },
      { label: 'Egg', optionPrice: 4 },
    ],
  },
]);

const incomplete = validateComboSelections({
  definition: def!,
  selections: [
    {
      slot_index: 1,
      variation_options: [
        { name: 'Doneness', values: { label: ['Medium'] } },
      ],
    },
  ],
  productVariationsJson: template,
});
assert.equal(incomplete.ok, false);

const complete = validateComboSelections({
  definition: def!,
  selections: [1, 2, 3, 4].map((slot_index) => ({
    slot_index,
    variation_options: [
      { name: 'Doneness', values: { label: ['Medium'] } },
      ...(slot_index === 2
        ? [{ name: 'Paid Upgrades', values: { label: ['Cheese', 'Egg'] } }]
        : []),
    ],
  })),
  productVariationsJson: template,
});
assert.equal(complete.ok, true);
if (!complete.ok) throw new Error('expected ok');

const kitchen = flattenComboSelectionsForKitchen(complete.selections, def);
assert.ok(
  kitchen.some(
    (g) =>
      g &&
      typeof g === 'object' &&
      String((g as { name?: string }).name).startsWith('Burger #2 ·')
  )
);

const extra = computeComboVariationExtra(template, complete.selections);
assert.equal(extra, 9); // Cheese 5 + Egg 4 on slot 2 only

console.log('test-combo-slots: OK', { kitchenRows: kitchen.length, extra });
