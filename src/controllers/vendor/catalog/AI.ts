import { Request, Response } from 'express';
import { aiPdfSchema, aiTextSchema } from '../../../schemas/vendor/Catalog';
import { uploadToCloudflare } from '../../../utils/cloudflare';

const GEMINI_IMAGE_MODELS = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
];

const GEMINI_TEXT_MODELS = ['gemini-3.6-flash', 'gemini-2.0-flash-001', 'gemini-flash-latest'];

function isHebrewText(text: string) {
    return /[\u0590-\u05FF]/.test(text);
}

async function translateFoodNameToEnglish(name: string, apiKey: string): Promise<string> {
    if (!isHebrewText(name)) return name;

    for (const model of GEMINI_TEXT_MODELS) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `Translate this Hebrew food item name to a simple, descriptive English food name. Output ONLY the English translation, no other text: ${name}`,
                            }],
                        }],
                    }),
                }
            );
            const data = await response.json();
            if (!response.ok) continue;
            const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (translated) return translated;
        } catch {
            // try next model
        }
    }
    return name;
}

async function generateGeminiFoodImageBuffer(
    prompt: string,
    apiKey: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    for (const model of GEMINI_IMAGE_MODELS) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
                    }),
                }
            );
            const data = await response.json();
            if (!response.ok) continue;

            const parts = data.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
                const inline = part.inlineData;
                if (inline?.data) {
                    const mimeType = inline.mimeType || 'image/png';
                    return { buffer: Buffer.from(inline.data, 'base64'), mimeType };
                }
            }
        } catch {
            // try next model
        }
    }
    return null;
}

function buildPollinationsFoodUrl(name: string, width = 800, height = 800) {
    const prompt = `Professional food photograph of ${name}, restaurant menu, appetizing, clean plate`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`;
}

async function fetchPollinationsImageBuffer(name: string): Promise<Buffer | null> {
    try {
        const response = await fetch(buildPollinationsFoodUrl(name));
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
    } catch {
        return null;
    }
}

async function persistGeneratedImage(buffer: Buffer, mimeType: string, subfolder: string): Promise<string | null> {
    try {
        const ext = mimeType.includes('png') ? 'png' : 'jpeg';
        return await uploadToCloudflare(buffer, mimeType, `ai-food.${ext}`, subfolder);
    } catch (error) {
        console.error('AI image upload failed:', error);
        return null;
    }
}

/**
 * @Description Parse PDF/Image menu using Gemini AI
 * 
 * FRONTEND INTEGRATION FLOW:
 * Step 1: The vendor uploads their PDF/Image menu using this endpoint.
 * Step 2: The frontend calls this /api/vendor/catalog/ai/parse-pdf endpoint. It instantly returns the JSON structure with all categories, items, and prices.
 * Step 3: The frontend displays this parsed list to the user so they can review the extracted text immediately.
 * Step 4: In the background, the frontend loops through the items and silently calls the /api/vendor/catalog/ai/generate-image endpoint for each item one by one. As each AI image finishes generating, it pops into the UI next to the food item
 * @Route POST /api/vendor/catalog/ai/parse-pdf
 * @Access Private (Vendor)
 */
export const parsePdf = async (req: Request, res: Response): Promise<any> => {
    if (!req.file) {
        return res.status(400).json({ status: false, msg: 'No file uploaded. Please upload a PDF or Image using the "file" form-data field.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ status: false, msg: 'GEMINI_API_KEY is not set in .env' });

    const mimeType = req.file.mimetype;
    const fileBase64 = req.file.buffer.toString('base64');

    const prompt = "You are a menu parsing expert. Extract all menu items, descriptions, prices, and categories from the provided menu image/PDF. IGNORE ANY VARIATIONS OR OPTIONS (like size, add-ons, etc.) and only extract the base item details.\n\nCRITICAL INSTRUCTION FOR MULTI-LANGUAGE MENUS:\nThe provided menu may contain separate sections for Hebrew and English (i.e. the entire menu printed first in Hebrew, then repeated in English).\nYOU MUST EXTRACT BOTH FULLY. Do NOT deduplicate items just because they are translations of each other. If there is a 'Focaccia' in English and a 'פוקאצ׳ה עשבי תיבול' in Hebrew, you MUST output BOTH as separate items in the JSON array.\nIf an item name is combined with a slash (e.g., 'Black Tea / תה שחור'), you must split it and create TWO separate entries.\nBottom line: DO NOT DROP OR SKIP ANY HEBREW TEXT. Both the Hebrew items and English items must be present as distinct items in your output.\n\nOutput a JSON object with a single key 'categories' containing an array of categories.\nEach category has:\n- 'name': category name (STRICTLY single language per category)\n- 'items': array of items. Each item must have:\n  - 'name': item name (STRICTLY single language per item)\n  - 'description': item description\n  - 'price': item base price (numeric)\nOutput ONLY valid raw JSON conforming to this schema, without markdown formatting or code blocks.";

    try {
        const models = ['gemini-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-1.0-pro-vision-latest', 'gemini-pro-vision'];
        let lastError = 'Failed to generate content';
        let parsedMenu = null;

        for (const model of models) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: fileBase64 } }] }],
                        generationConfig: { responseMimeType: 'application/json' }
                    })
                });
                
                const data = await response.json();
                if (!response.ok) {
                    lastError = data.error?.message || `Error with model ${model}`;
                    continue;
                }
                
                const text = data.candidates[0].content.parts[0].text;
                parsedMenu = JSON.parse(text);
                break;
            } catch (err: any) {
                lastError = err.message;
            }
        }
        
        if (!parsedMenu) {
            throw new Error(lastError);
        }

        return res.status(200).json({ status: true, data: parsedMenu });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Generate food description using Gemini AI
 * @Route POST /api/vendor/catalog/ai/description
 * @Access Private (Vendor)
 */
export const generateDescription = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = aiTextSchema.validate(payload);
    if (result.error) return res.status(400).json({ status: false, msg: result.error.details.map((d:any)=>d.message).join(',') });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ status: false, msg: 'GEMINI_API_KEY is not set in .env' });

    // Assuming English for simplicity in MVP translation check
    const prompt = `Write a short, appetizing menu description for a food item called "${payload.name}". 1-2 sentences only, focus on taste and appeal. Plain text, no markdown.`;

    try {
        const models = ['gemini-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-pro'];
        let lastError = 'Failed to generate content';
        let text = null;

        for (const model of models) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                
                const data = await response.json();
                if (!response.ok) {
                    lastError = data.error?.message || `Error with model ${model}`;
                    continue;
                }
                
                text = data.candidates[0].content.parts[0].text.trim();
                break;
            } catch (err: any) {
                lastError = err.message;
            }
        }

        if (!text) {
            throw new Error(lastError);
        }

        return res.status(200).json({ status: true, data: { description: text } });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};


/**
 * @Description Generate a food image using Gemini AI
 * @Route POST /api/vendor/catalog/ai/generate-image
 * @Access Private (Vendor)
 */
export const generateFoodImage = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body || {};
    const result = aiTextSchema.validate(payload);
    if (result.error) return res.status(400).json({ status: false, msg: result.error.details.map((d:any)=>d.message).join(',') });

    const name = String(payload.name || '').trim();
    if (!name) return res.status(400).json({ status: false, msg: 'Item name is required' });

    const apiKey = process.env.GEMINI_API_KEY || '';
    const englishName = apiKey ? await translateFoodNameToEnglish(name, apiKey) : name;
    const prompt = `Generate a professional food photograph of ${englishName}. Restaurant quality, appetizing, clean white plate, high quality food menu photo.`;

    if (apiKey) {
        const geminiImage = await generateGeminiFoodImageBuffer(prompt, apiKey);
        if (geminiImage) {
            const hosted = await persistGeneratedImage(
                geminiImage.buffer,
                geminiImage.mimeType,
                'vendor/ai/foods'
            );
            if (hosted) {
                return res.status(200).json({ status: true, data: { image: hosted, source: 'gemini' } });
            }
        }
    }

    const pollinationsBuffer = await fetchPollinationsImageBuffer(englishName);
    if (pollinationsBuffer) {
        const hosted = await persistGeneratedImage(
            pollinationsBuffer,
            'image/jpeg',
            'vendor/ai/foods'
        );
        if (hosted) {
            return res.status(200).json({ status: true, data: { image: hosted, source: 'pollinations' } });
        }
    }

    const directUrl = buildPollinationsFoodUrl(englishName);
    return res.status(200).json({
        status: true,
        data: { image: directUrl, source: 'pollinations-direct' },
        msg: apiKey
            ? 'Serving direct AI image URL (storage upload unavailable)'
            : 'GEMINI_API_KEY not set; using direct AI image URL',
    });
};

/**
 * @Description Generate a category banner image using Gemini AI
 * @Route POST /api/vendor/catalog/ai/generate-category-image
 * @Access Private (Vendor)
 */
export const generateCategoryImage = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body || {};
    const result = aiTextSchema.validate(payload);
    if (result.error) return res.status(400).json({ status: false, msg: result.error.details.map((d:any)=>d.message).join(',') });

    const name = String(payload.name || '').trim();
    if (!name) return res.status(400).json({ status: false, msg: 'Item name is required' });

    const apiKey = process.env.GEMINI_API_KEY || '';
    const prompt = `Generate a professional food category banner photo for a restaurant menu category called "${name}". Clean, appetizing, high quality, suitable as a menu category header image.`;

    if (apiKey) {
        const geminiImage = await generateGeminiFoodImageBuffer(prompt, apiKey);
        if (geminiImage) {
            const hosted = await persistGeneratedImage(
                geminiImage.buffer,
                geminiImage.mimeType,
                'vendor/ai/categories'
            );
            if (hosted) {
                return res.status(200).json({ status: true, data: { image: hosted, source: 'gemini' } });
            }
        }
    }

    try {
        const bannerPrompt = `Professional food category banner for ${name}, restaurant menu header`;
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(bannerPrompt)}?width=1200&height=400&nologo=true`;
        const response = await fetch(imageUrl);
        if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const hosted = await persistGeneratedImage(buffer, 'image/jpeg', 'vendor/ai/categories');
            if (hosted) {
                return res.status(200).json({ status: true, data: { image: hosted, source: 'pollinations' } });
            }
            return res.status(200).json({ status: true, data: { image: imageUrl, source: 'pollinations-direct' } });
        }
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }

    return res.status(500).json({ status: false, msg: 'Category image generation failed' });
};
