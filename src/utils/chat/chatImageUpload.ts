import { uploadToCloudflare } from '../cloudflare';
import { normalizeStoredMedia, publicMediaUrl } from '../mediaStorage';

export async function uploadChatImageFile(
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<{ image_url: string }> {
  const fileUrl = await uploadToCloudflare(buffer, mimetype, originalname, 'conversation');
  const stored = normalizeStoredMedia(fileUrl, 'def.png');
  const image_url = publicMediaUrl(stored) ?? fileUrl;
  return { image_url };
}
