import { uploadToCloudflare } from '../cloudflare';
import { listGeminiImageModelIds } from '../gemini/geminiModels';

const CATEGORY_PLACEHOLDERS = new Set(['def.png', 'default.png']);

export function isStoredCategoryImagePlaceholder(image: string | null | undefined): boolean {
  if (image == null || String(image).trim() === '') return true;
  const value = String(image).trim().toLowerCase();
  if (CATEGORY_PLACEHOLDERS.has(value)) return true;
  return value.endsWith('/def.png') || value.endsWith('/default.png');
}

async function generateGeminiImageBuffer(
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

async function persistGeneratedImage(
  buffer: Buffer,
  mimeType: string,
  subfolder: string
): Promise<string | null> {
  try {
    const ext = mimeType.includes('png') ? 'png' : 'jpeg';
    return await uploadToCloudflare(buffer, mimeType, `ai-category.${ext}`, subfolder);
  } catch (error) {
    console.error('Category image upload failed:', error);
    return null;
  }
}

export type CategoryImageGenerationResult = {
  image: string;
  source: 'gemini' | 'pollinations' | 'pollinations-direct';
};

/**
 * Generate a hosted category banner URL (R2) or direct Pollinations URL — same pipeline as vendor AI endpoint.
 */
export async function generateCategoryImageForName(
  name: string
): Promise<CategoryImageGenerationResult | null> {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;

  const apiKey = process.env.GEMINI_API_KEY || '';
  const prompt = `Generate a professional food category banner photo for a restaurant menu category called "${trimmed}". Clean, appetizing, high quality, suitable as a menu category header image.`;

  if (apiKey) {
    const geminiImage = await generateGeminiImageBuffer(prompt, apiKey);
    if (geminiImage) {
      const hosted = await persistGeneratedImage(
        geminiImage.buffer,
        geminiImage.mimeType,
        'vendor/ai/categories'
      );
      if (hosted) {
        return { image: hosted, source: 'gemini' };
      }
    }
  }

  try {
    const bannerPrompt = `Professional food category banner for ${trimmed}, restaurant menu header`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(bannerPrompt)}?width=1200&height=400&nologo=true`;
    const response = await fetch(imageUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const hosted = await persistGeneratedImage(buffer, 'image/jpeg', 'vendor/ai/categories');
      if (hosted) {
        return { image: hosted, source: 'pollinations' };
      }
      return { image: imageUrl, source: 'pollinations-direct' };
    }
  } catch (error) {
    console.error('Pollinations category image failed:', error);
  }

  return null;
}
