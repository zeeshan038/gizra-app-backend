import {
  enrichVariationSelectionsForKitchen,
  formatKitchenModifierName,
  normalizePizzaPlacement,
  variationKitchenLinesFromStored,
} from '../src/utils/order/pizzaPlacement';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const enriched = enrichVariationSelectionsForKitchen([
  {
    name: 'תוספות',
    type: 'multi',
    values: [
      { label: 'זיתים', pizzaPlacement: 'half_a' },
      { label: 'תירס', pizzaPlacement: 'whole' },
    ],
  },
]);

const stored = JSON.stringify(enriched);
const lines = variationKitchenLinesFromStored(stored);
assert(lines.some((l) => l.includes('זיתים') && l.includes('חצי א')), lines.join('|'));
assert(lines.some((l) => l.includes('תירס') && l.includes('שלם')), lines.join('|'));

assert(
  formatKitchenModifierName('פטריות', 'half_b') === "פטריות (חצי ב')",
  'addon suffix'
);
assert(normalizePizzaPlacement('HALF_A') === 'half_a', 'normalize');

console.log('test-pizza-placement: ok');