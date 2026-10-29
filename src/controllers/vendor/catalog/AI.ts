import { Request, Response } from 'express';
import { aiPdfSchema, aiTextSchema } from '../../../schemas/vendor/Catalog';
import { uploadToCloudflare } from '../../../utils/cloudflare';
import {
    isGeminiBillingOrQuotaError,
    listGeminiGenerationModelIds,
    listGeminiImageModelIds,
} from '../../../utils/gemini/geminiModels';
import { parseMenuFromUpload } from '../../../utils/vendor/menuAiParse';
import { generateCategoryImageForName } from '../../../utils/vendor/categoryImageGeneration';

function isHebrewText(text: string) {
    return /[\u0590-\u05FF]/.test(text);
}

async function translateFoodNameToEnglish(name: string, apiKey: string): Promise<string> {
    if (!isHebrewText(name)) return name;

    const textModels = await listGeminiGenerationModelIds(apiKey);
    for (const model of textModels) {
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
    const imageModels = await listGeminiImageModelIds(apiKey);
    for (const model of imageModels) {
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

    try {
        const parsedMenu = await parseMenuFromUpload({ apiKey, mimeType, fileBase64 });
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
        let lastError = 'Failed to generate content';
        let text = null;

        const textModels = await listGeminiGenerationModelIds(apiKey);
        for (const model of textModels) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                
                const data = await response.json();
                if (!response.ok) {
                    const msg = data.error?.message || `Error with model ${model}`;
                    if (isGeminiBillingOrQuotaError(msg)) {
                        throw new Error(
                            'Gemini API credits or quota exhausted. Check Google AI Studio billing for this API key.'
                        );
                    }
                    lastError = msg;
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

    const generated = await generateCategoryImageForName(name);
    if (!generated) {
        return res.status(500).json({ status: false, msg: 'Category image generation failed' });
    }

    return res.status(200).json({
        status: true,
        data: { image: generated.image, source: generated.source },
    });
};
