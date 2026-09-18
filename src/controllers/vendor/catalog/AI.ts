import { Request, Response } from 'express';
import { aiPdfSchema, aiTextSchema } from '../../../schemas/vendor/Catalog';
import { GoogleGenAI } from '@google/genai';

/**
 * @Description Parse PDF/Image menu using Gemini AI
 * 
 * FRONTEND INTEGRATION FLOW:
 * Step 1: The vendor uploads their PDF/Image menu using this endpoint.
 * Step 2: The frontend calls this /api/vendor/catalog/ai/parse-pdf endpoint. It instantly returns the JSON structure with all categories, items, and prices.
 * Step 3: The frontend displays this parsed list to the user so they can review the extracted text immediately.
 * Step 4: In the background, the frontend loops through the items and silently calls the /api/vendor/catalog/ai/generate-image endpoint for each item one by one. As each AI image finishes generating, it pops into the UI next to the food item!
 * 
 * @Route POST /api/v1/vendor/catalog/ai/parse-pdf
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
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: fileBase64 } }] }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Gemini API Error');
        
        const text = data.candidates[0].content.parts[0].text;
        const parsedMenu = JSON.parse(text);
        
        return res.status(200).json({ status: true, data: parsedMenu });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Generate food description using Gemini AI
 * @Route POST /api/v1/vendor/catalog/ai/description
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
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Gemini API Error');
        
        const text = data.candidates[0].content.parts[0].text.trim();
        return res.status(200).json({ status: true, data: { description: text } });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};


/**
 * @Description Generate a food image using Gemini AI
 * @Route POST /api/v1/vendor/catalog/ai/generate-image
 * @Access Private (Vendor)
 */
export const generateFoodImage = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = aiTextSchema.validate(payload);
    if (result.error) return res.status(400).json({ status: false, msg: result.error.details.map((d:any)=>d.message).join(',') });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ status: false, msg: 'GEMINI_API_KEY is not set in .env' });

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Generate a professional food photograph of ${payload.name}. Restaurant quality, appetizing, clean white plate, high quality food menu photo.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: prompt,
            config: { outputMimeType: 'image/png' }
        });

        const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (!part || !part.inlineData) {
            throw new Error('Failed to extract image bytes from response.');
        }

        const base64Image = part.inlineData.data;
        const mimeType = 'image/png';
        
        return res.status(200).json({ status: true, data: { image: `data:${mimeType};base64,${base64Image}` } });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Generate a category banner image using Gemini AI
 * @Route POST /api/v1/vendor/catalog/ai/generate-category-image
 * @Access Private (Vendor)
 */
export const generateCategoryImage = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = aiTextSchema.validate(payload);
    if (result.error) return res.status(400).json({ status: false, msg: result.error.details.map((d:any)=>d.message).join(',') });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ status: false, msg: 'GEMINI_API_KEY is not set in .env' });

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Generate a professional food category banner photo for a restaurant menu category called "${payload.name}". Clean, appetizing, high quality, suitable as a menu category header image.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: prompt,
            config: { outputMimeType: 'image/png' }
        });

        const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (!part || !part.inlineData) {
            throw new Error('Failed to extract image bytes from response.');
        }

        const base64Image = part.inlineData.data;
        const mimeType = 'image/png';
        
        return res.status(200).json({ status: true, data: { image: `data:${mimeType};base64,${base64Image}` } });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};
