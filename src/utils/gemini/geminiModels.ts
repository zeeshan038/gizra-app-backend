const MODEL_CACHE_MS = 60 * 60 * 1000;

let cachedGenerationModels: { at: number; ids: string[] } | null = null;

/** Prefer newest text/multimodal flash; skip TTS, image-only, omni, retired 2.x. */
export function scoreGeminiTextModel(id: string): number {
  const lower = id.toLowerCase();
  if (
    lower.includes('tts') ||
    lower.includes('-image') ||
    lower.includes('image-') ||
    lower.includes('omni') ||
    lower.includes('nano-banana')
  ) {
    return -1;
  }
  if (lower.startsWith('gemini-2.0') || lower === 'gemini-pro-vision' || lower === 'gemini-pro') {
    return -1;
  }
  const versioned = lower.match(/^gemini-(\d+)\.(\d+)-flash$/);
  if (versioned) {
    return 2000 + Number(versioned[1]) * 100 + Number(versioned[2]);
  }
  if (lower === 'gemini-flash-latest') return 1950;
  if (lower.includes('3-flash-preview')) return 1800;
  if (lower.includes('2.5-flash')) return 500;
  if (lower.includes('flash-lite')) return 400;
  return 100;
}

export function scoreGeminiImageModel(id: string): number {
  const lower = id.toLowerCase();
  if (!lower.includes('image')) return -1;
  if (lower.includes('lite-image')) return 800;
  const versioned = lower.match(/gemini-(\d+)\.(\d+)-flash-image/);
  if (versioned) return 1000 + Number(versioned[1]) * 100 + Number(versioned[2]);
  if (lower.includes('3-pro-image')) return 950;
  return 100;
}

const STATIC_TEXT_FALLBACK = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
];

const STATIC_IMAGE_FALLBACK = ['gemini-3.1-flash-image', 'gemini-3-pro-image'];

type ListedModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

export async function listGeminiGenerationModelIds(apiKey: string): Promise<string[]> {
  if (cachedGenerationModels && Date.now() - cachedGenerationModels.at < MODEL_CACHE_MS) {
    return cachedGenerationModels.ids;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    const data = (await res.json()) as { models?: ListedModel[]; error?: { message?: string } };
    if (!res.ok) {
      console.warn('[gemini] list models failed:', data.error?.message ?? res.status);
      return STATIC_TEXT_FALLBACK;
    }

    const ranked = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter((id) => id && scoreGeminiTextModel(id) >= 0)
      .sort((a, b) => scoreGeminiTextModel(b) - scoreGeminiTextModel(a));

    const ids = [...new Set(ranked.length ? ranked : STATIC_TEXT_FALLBACK)];
    cachedGenerationModels = { at: Date.now(), ids };
    return ids;
  } catch (e) {
    console.warn('[gemini] list models error', e);
    return STATIC_TEXT_FALLBACK;
  }
}

export async function listGeminiImageModelIds(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    const data = (await res.json()) as { models?: ListedModel[] };
    if (!res.ok) return STATIC_IMAGE_FALLBACK;

    const ranked = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter((id) => id && scoreGeminiImageModel(id) >= 0)
      .sort((a, b) => scoreGeminiImageModel(b) - scoreGeminiImageModel(a));

    return [...new Set(ranked.length ? ranked : STATIC_IMAGE_FALLBACK)];
  } catch {
    return STATIC_IMAGE_FALLBACK;
  }
}

export function isGeminiBillingOrQuotaError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('depleted') ||
    m.includes('quota') ||
    m.includes('billing') ||
    m.includes('exceeded your current quota') ||
    m.includes('resource_exhausted')
  );
}

export function isGeminiModelUnavailableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('not found') ||
    m.includes('no longer') ||
    m.includes('not supported for generatecontent')
  );
}
