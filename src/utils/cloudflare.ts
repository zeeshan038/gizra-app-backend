import dotenv from 'dotenv';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../config/database';

dotenv.config();

export type AccountStorageRole = 'admin' | 'vendor' | 'deliveryman' | 'customer';

export const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY || '',
    },
});

/**
 * Upload a file to Cloudflare R2
 */
export const uploadToCloudflare = async (fileBuffer: Buffer, mimetype: string, originalName: string, subfolder: string = '') => {
    try {
        const bucketName = process.env.CLOUDFLARE_BUCKET_NAME || '';
        const publicUrl = process.env.CLOUDFLARE_PUBLIC_URL || '';

        // Generate a unique filename
        const ext = originalName.split('.').pop() || 'png';
        const uniqueFilename = `${crypto.randomBytes(16).toString('hex')}-${Date.now()}.${ext}`;
        
        // Include subfolder if provided
        const fileKey = subfolder ? `${subfolder}/${uniqueFilename}` : uniqueFilename;

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
            Body: fileBuffer,
            ContentType: mimetype,
        });

        await s3.send(command);

        const formattedBaseUrl = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;

        return `${formattedBaseUrl}${fileKey}`;
    } catch (error: any) {
        console.error("Cloudflare upload error:", error);
        throw new Error(error.message);
    }
};

export async function isCloudflareIdTaken(id: string): Promise<boolean> {
  const normalized = id.toLowerCase();
  const [admin, vendor, driver] = await Promise.all([
    prisma.admins.findFirst({ where: { cloudflareId: normalized } }),
    prisma.vendors.findFirst({ where: { cloudflareId: normalized } }),
    prisma.delivery_men.findFirst({ where: { cloudflareId: normalized } }),
  ]);
  return Boolean(admin || vendor || driver);
}

/**
 * Generate a unique 12-character ID for a user's Cloudflare folder.
 */
export async function generateUniqueCloudflareId(userType: AccountStorageRole): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
        const id = crypto.randomBytes(6).toString('hex');
        let exists = null;

        if (userType === 'admin') {
            exists = await prisma.admins.findFirst({ where: { cloudflareId: id } });
        } else if (userType === 'vendor') {
            exists = await prisma.vendors.findFirst({ where: { cloudflareId: id } });
        } else if (userType === 'deliveryman') {
            exists = await prisma.delivery_men.findFirst({ where: { cloudflareId: id } });
        } else if (userType === 'customer') {
            // Legacy `users` table has no cloudflareId column; id is random-only for R2 paths.
            return id;
        }

        if (!exists) return id;
    }
    throw new Error(`Could not allocate unique cloudflareId for ${userType}`);
}

/**
 * Create logical R2 folders for a user by uploading empty .keep files.
 * @param cloudflareId The user's unique Cloudflare ID
 * @param userType Type of user to build base path correctly
 */
export async function ensureR2UserFolders(cloudflareId: string, userType: AccountStorageRole) {
    if (!cloudflareId) return;

    const bucketName = process.env.CLOUDFLARE_BUCKET_NAME || '';
    if (!bucketName) return;

    const folderMapping: Record<AccountStorageRole, string> = {
        admin: 'admin',
        vendor: 'vendors',
        deliveryman: 'deliveryman',
        customer: 'customer',
    };

    const basePath = `${folderMapping[userType]}/${cloudflareId}`;

    const createKeepFile = async (folderPath: string) => {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: `${folderPath}/.keep`,
            Body: '',
            ContentType: 'text/plain',
        });
        await s3.send(command);
    };

    const folders = [`${basePath}/assets`];
    if (userType === 'vendor') {
        folders.push(`${basePath}/restaurant`);
    }
    if (userType === 'deliveryman') {
        folders.push(`${basePath}/identity`, `${basePath}/profile`);
    }

    await Promise.all(folders.map((folderPath) => createKeepFile(folderPath)));
}
