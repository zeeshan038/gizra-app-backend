import {
    isGeminiBillingOrQuotaError,
    isGeminiModelUnavailableError,
    listGeminiGenerationModelIds,
} from '../gemini/geminiModels';

export type ParsedMenuItem = {
    name: string;
    description?: string;
    price: number;
    variations?: unknown[];
    add_ons?: unknown[];
};

export type ParsedMenuCategory = {
    name: string;
    items: ParsedMenuItem[];
};

export type ParsedMenu = {
    categories: ParsedMenuCategory[];
};

const MENU_PARSE_MAX_OUTPUT_TOKENS = 65536;
const MENU_PARSE_MAX_CONTINUATION_ROUNDS = 12;

export const MENU_PARSE_PROMPT = `You are an expert restaurant menu OCR and structuring engine. Your job is to produce POS-ready JSON from poster-style menus (multi-column tops + footer blocks for sizes/toppings).

=== COMPLETENESS (CRITICAL) ===
- Extract EVERY dish, beverage, and priced item on ALL pages of the document. Menus often have 100–500+ items.
- Do NOT stop at 50 items or any sample limit. Do NOT summarize, skip, or merge distinct items to save space.
- Keep descriptions to one short phrase when needed, but NEVER omit an item to shorten output.

=== NON-NEGOTIABLE RULES ===
1. NEVER skip variations when the menu defines sizes anywhere on the page (same row OR a separate footer section).
2. NEVER create duplicate items for sizes (e.g. "Margherita Large" as its own item). ONE dish = ONE item + variations.
3. Option "price" in JSON may be the FULL menu price for that choice (e.g. Personal 45, Medium 55). The server converts these to up-charges; still output readable menu numbers from the PDF.
4. item "price" MUST equal the cheapest option in the first required variation group (usually smallest size).
5. Output ONLY valid JSON: { "categories": [ ... ] }. No markdown, no comments.

=== LAYOUT: ITEMS ON TOP, SIZES ON BOTTOM (VERY COMMON) ===
Many menus list dish names + one price in category columns at the TOP, then a separate footer band such as:
  "Choose Your Size" / "Size" / Personal · Regular · Large with prices on another row.
You MUST link that footer size block to every applicable item in the category above (e.g. all PIZZA items get the same Size group).

Algorithm:
A) Read the footer (or side) size block: labels (include inch/cm if shown, e.g. Personal 7 inch) and numeric prices.
B) Read each dish in the category and its listed price (often the smallest/default size).
C) If footer prices are GLOBAL (one set for the whole category):
   - Let S0 = smallest footer size price, Sk = price for each footer size k.
   - For each dish with listed price P (from the top list):
     - Smallest size option price = P (use the dish's own top price, not necessarily S0).
     - Each larger size k: option price = P + (Sk - S0). Round to 2 decimals if needed.
   - Example: footer Personal 149, Regular 249, Large 399; Margherita 149 → 149, 249, 399; Farmhouse 179 → 179, 279, 429.
D) If each dish row already shows multiple size columns, use those column prices directly (no delta math).
E) Attach one variation group per item:
   { "name": "Size", "type": "single", "required": true, "options": [ { "name": "<label>", "price": <number> }, ... ] }

If a category has NO size footer and only one price per dish → "variations": [].

=== OTHER VARIATION PATTERNS ===
- Sauce/type rows (White Sauce / Red Sauce / Mixed) for pasta: one group "Sauce" or "Type", required true if customer must pick.
- Burger single price only: variations [] unless sizes appear elsewhere.

=== ADD-ONS (optional extras) ===
Sections like "Customize It", "Extra Toppings", "Add-ons" with +₹ prices:
- Put in "add_ons": [ { "name", "price" } ] on each item in categories that section applies to (typically all pizzas if under pizza footer).
- Do NOT put sizes in add_ons.
- Shared topping list → copy the same add_ons array to each relevant item (do not omit).

=== CATEGORIES ===
- Use visible headers: PIZZA, BURGERS, PASTA, WRAPS, SIDES, etc.
- Fries / sides listed in "Add Something Extra" can be their own category if priced as standalone items.

=== MULTI-LANGUAGE ===
Hebrew + English sections: extract BOTH; do not merge translations.
Slash names "X / Y" → two items unless clearly one bilingual label for the same dish (then pick primary language shown larger).

=== JSON SHAPE (strict) ===
{
  "categories": [
    {
      "name": "PIZZA",
      "items": [
        {
          "name": "Margherita",
          "description": "Classic cheese & herbs",
          "price": 149,
          "variations": [
            {
              "name": "Size",
              "type": "single",
              "required": true,
              "options": [
                { "name": "Personal 7 inch", "price": 149 },
                { "name": "Regular 10 inch", "price": 249 },
                { "name": "Large 12 inch", "price": 399 }
              ]
            }
          ],
          "add_ons": [
            { "name": "Extra Cheese", "price": 70 }
          ]
        }
      ]
    }
  ]
}

Before you finish: for every PIZZA (and similar) item, confirm "variations" is non-empty when a size footer exists. Re-scan the bottom of the image if any item is missing Size options.`;

function extractJsonObject(text: string): unknown {
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(trimmed.slice(start, end + 1));
        }
        throw new Error('Model returned non-JSON menu output');
    }
}

function normalizeCategoryKey(name: string): string {
    return name.trim().toLowerCase();
}

function normalizeItemKey(categoryName: string, itemName: string): string {
    return `${normalizeCategoryKey(categoryName)}\0${itemName.trim().toLowerCase()}`;
}

export function countMenuItems(menu: ParsedMenu): number {
    return menu.categories.reduce((sum, cat) => sum + (cat.items?.length ?? 0), 0);
}

export function listExtractedItemNames(menu: ParsedMenu, maxNames = 400): string[] {
    const names: string[] = [];
    for (const cat of menu.categories) {
        for (const item of cat.items ?? []) {
            const n = String(item.name ?? '').trim();
            if (n) names.push(n);
            if (names.length >= maxNames) return names;
        }
    }
    return names;
}

export function mergeParsedMenus(base: ParsedMenu, extra: ParsedMenu): ParsedMenu {
    const categoryOrder: string[] = [];
    const categoryMap = new Map<string, ParsedMenuCategory>();
    const itemKeys = new Set<string>();

    const ingest = (menu: ParsedMenu) => {
        for (const cat of menu.categories ?? []) {
            const catName = String(cat.name ?? '').trim();
            if (!catName) continue;

            const key = normalizeCategoryKey(catName);
            if (!categoryMap.has(key)) {
                categoryMap.set(key, { name: catName, items: [] });
                categoryOrder.push(key);
            }
            const bucket = categoryMap.get(key)!;

            for (const raw of cat.items ?? []) {
                const itemName = String(raw.name ?? '').trim();
                if (!itemName) continue;
                const dedupeKey = normalizeItemKey(catName, itemName);
                if (itemKeys.has(dedupeKey)) continue;
                itemKeys.add(dedupeKey);
                bucket.items.push(raw);
            }
        }
    };

    ingest(base);
    ingest(extra);

    return {
        categories: categoryOrder.map((key) => categoryMap.get(key)!),
    };
}

function toParsedMenu(raw: unknown): ParsedMenu | null {
    if (!raw || typeof raw !== 'object') return null;
    const categories = (raw as { categories?: unknown }).categories;
    if (!Array.isArray(categories)) return null;
    return { categories: categories as ParsedMenuCategory[] };
}

type GeminiGenerateResponse = {
    candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
    }>;
    error?: { message?: string };
};

function buildGenerationConfig(jsonMode: boolean) {
    return {
        maxOutputTokens: MENU_PARSE_MAX_OUTPUT_TOKENS,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    };
}

function buildContinuationPrompt(alreadyExtracted: string[]): string {
    const sample = alreadyExtracted.slice(0, 350);
    const truncatedNote =
        alreadyExtracted.length > sample.length
            ? `\n(${alreadyExtracted.length - sample.length} more names already extracted — do not repeat any of them.)`
            : '';

    return `${MENU_PARSE_PROMPT}

=== CONTINUATION PASS ===
You already extracted ${alreadyExtracted.length} item(s) from this same menu file. Do NOT duplicate them.
Already extracted item names:
${sample.map((n) => `- ${n}`).join('\n')}${truncatedNote}

Scan the FULL menu again (all pages). Output ONLY items NOT in the list above.
Return valid JSON: { "categories": [ { "name", "items": [...] } ] } with the same schema as before.`;
}

async function callGeminiMenuOnce(params: {
    apiKey: string;
    model: string;
    mimeType: string;
    fileBase64: string;
    prompt: string;
    jsonMode: boolean;
}): Promise<{ text: string; finishReason: string | null; error?: string }> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: params.prompt },
                        { inlineData: { mimeType: params.mimeType, data: params.fileBase64 } },
                    ],
                }],
                generationConfig: buildGenerationConfig(params.jsonMode),
            }),
        }
    );

    const data = (await response.json()) as GeminiGenerateResponse;
    if (!response.ok) {
        return { text: '', finishReason: null, error: data.error?.message || `HTTP ${response.status}` };
    }

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text?.trim() ?? '';
    return {
        text,
        finishReason: candidate?.finishReason ?? null,
    };
}

async function parseWithModel(params: {
    apiKey: string;
    model: string;
    mimeType: string;
    fileBase64: string;
}): Promise<ParsedMenu> {
    let merged: ParsedMenu = { categories: [] };
    let prompt = MENU_PARSE_PROMPT;
    let rounds = 0;

    while (rounds <= MENU_PARSE_MAX_CONTINUATION_ROUNDS) {
        let parsedChunk: ParsedMenu | null = null;
        let lastError = 'Empty response from Gemini';
        let finishReason: string | null = null;

        for (const jsonMode of [true, false] as const) {
            const result = await callGeminiMenuOnce({
                ...params,
                prompt,
                jsonMode,
            });

            if (result.error) {
                lastError = result.error;
                if (isGeminiBillingOrQuotaError(result.error)) {
                    throw new Error(
                        'Gemini API credits or quota exhausted. Open Google AI Studio → Billing / credits for this API key, then retry menu import.'
                    );
                }
                continue;
            }

            finishReason = result.finishReason;
            if (!result.text) continue;

            try {
                const raw = extractJsonObject(result.text);
                parsedChunk = toParsedMenu(raw);
                if (parsedChunk) break;
                lastError = 'Model JSON missing categories array';
            } catch (err: unknown) {
                lastError = err instanceof Error ? err.message : 'Parse failed';
            }
        }

        if (!parsedChunk) {
            if (rounds === 0) throw new Error(lastError);
            break;
        }

        merged = mergeParsedMenus(merged, parsedChunk);
        rounds++;

        const chunkCount = countMenuItems(parsedChunk);
        const hitTokenLimit =
            finishReason === 'MAX_TOKENS' ||
            finishReason === 'LENGTH' ||
            (finishReason === 'STOP' && chunkCount >= 45);

        if (!hitTokenLimit || rounds > MENU_PARSE_MAX_CONTINUATION_ROUNDS) {
            break;
        }

        const names = listExtractedItemNames(merged);
        prompt = buildContinuationPrompt(names);
        console.info(
            `[menu-import] ${params.model} continuation round ${rounds} (${names.length} items so far, finishReason=${finishReason})`
        );
    }

    if (countMenuItems(merged) === 0) {
        throw new Error('No menu items extracted');
    }

    return merged;
}

export async function parseMenuFromUpload(params: {
    apiKey: string;
    mimeType: string;
    fileBase64: string;
}): Promise<ParsedMenu> {
    const models = await listGeminiGenerationModelIds(params.apiKey);
    console.info(`[menu-import] Gemini models (top 5): ${models.slice(0, 5).join(', ')}`);

    let lastError = 'Failed to parse menu with Gemini';

    for (const model of models) {
        try {
            const menu = await parseWithModel({ ...params, model });
            console.info(`[menu-import] Parsed ${countMenuItems(menu)} items with ${model}`);
            return menu;
        } catch (err: unknown) {
            if (err instanceof Error && isGeminiBillingOrQuotaError(err.message)) {
                throw err;
            }
            const msg = err instanceof Error ? err.message : 'Parse failed';
            console.warn(`[menu-import] Gemini ${model}: ${msg}`);
            if (!isGeminiModelUnavailableError(msg)) {
                lastError = msg;
            }
        }
    }

    throw new Error(lastError);
}
