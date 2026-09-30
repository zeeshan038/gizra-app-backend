import { Router, Request, Response } from 'express';
import { uploadToCloudflare } from '../utils/cloudflare';
import {
  assertUploadSubfolderAllowed,
  buildUploadSubfolder,
  type RegistrationStorageRole,
} from '../utils/accountStorage';
import { normalizeStoredMedia } from '../utils/mediaStorage';
import multer from 'multer';

const uploadRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function resolveSubfolder(body: Record<string, unknown>): string {
  const role = body.role as RegistrationStorageRole | undefined;
  const cloudflareId =
    typeof body.cloudflare_id === 'string' ? body.cloudflare_id.trim().toLowerCase() : '';
  const explicit =
    typeof body.subfolder === 'string' ? body.subfolder.trim().replace(/^\/+|\/+$/g, '') : '';

  if (role && cloudflareId) {
    if (role !== 'vendor' && role !== 'deliveryman') {
      throw new Error('role must be vendor or deliveryman when cloudflare_id is set');
    }
    if (explicit) {
      assertUploadSubfolderAllowed(role, cloudflareId, explicit);
      return explicit;
    }
    const category = typeof body.category === 'string' ? body.category : 'assets';
    const allowedCategories = ['restaurant', 'identity', 'profile', 'assets'];
    const cat = allowedCategories.includes(category)
      ? (category as 'restaurant' | 'identity' | 'profile' | 'assets')
      : 'assets';
    return buildUploadSubfolder(role, cloudflareId, cat);
  }

  return explicit || 'assets';
}

uploadRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: false, msg: 'No file uploaded' });
    }

    let subfolder: string;
    try {
      subfolder = resolveSubfolder(req.body as Record<string, unknown>);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid upload parameters';
      return res.status(400).json({ status: false, msg });
    }

    const fileUrl = await uploadToCloudflare(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      subfolder
    );

    const path = normalizeStoredMedia(fileUrl, '');

    return res.status(200).json({
      status: true,
      msg: 'File uploaded successfully',
      url: fileUrl,
      path: path || undefined,
      subfolder,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return res.status(500).json({
      status: false,
      msg: message,
    });
  }
});

export default uploadRouter;
