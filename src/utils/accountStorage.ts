import {
  ensureR2UserFolders,
  generateUniqueCloudflareId,
  isCloudflareIdTaken,
  type AccountStorageRole,
} from './cloudflare';

export type RegistrationStorageRole = 'vendor' | 'deliveryman';

export function storageRoleFolder(role: AccountStorageRole): string {
  if (role === 'vendor') return 'vendors';
  if (role === 'deliveryman') return 'deliveryman';
  if (role === 'admin') return 'admin';
  return 'customer';
}

export function buildUploadSubfolder(
  role: RegistrationStorageRole,
  cloudflareId: string,
  category: 'restaurant' | 'identity' | 'profile' | 'assets' = 'assets'
): string {
  const base = `${storageRoleFolder(role)}/${cloudflareId}`;
  if (category === 'restaurant') return `${base}/restaurant`;
  if (category === 'identity') return `${base}/identity`;
  if (category === 'profile') return `${base}/profile`;
  return `${base}/assets`;
}

export function registrationUploadHints(role: RegistrationStorageRole, cloudflareId: string) {
  return {
    cloudflareId,
    basePrefix: `${storageRoleFolder(role)}/${cloudflareId}`,
    subfolders: {
      assets: buildUploadSubfolder(role, cloudflareId, 'assets'),
      restaurant: buildUploadSubfolder(role, cloudflareId, 'restaurant'),
      identity: buildUploadSubfolder(role, cloudflareId, 'identity'),
      profile: buildUploadSubfolder(role, cloudflareId, 'profile'),
    },
  };
}

/** Reserve or validate cloudflareId and create default R2 prefixes. */
export async function provisionAccountStorage(
  role: AccountStorageRole,
  clientCloudflareId?: string | null
): Promise<string> {
  const trimmed = clientCloudflareId?.trim();
  let id: string;

  if (trimmed) {
    if (!/^[a-f0-9]{12}$/i.test(trimmed)) {
      throw new Error('Invalid cloudflare_id format');
    }
    if (await isCloudflareIdTaken(trimmed)) {
      throw new Error('cloudflare_id is already in use');
    }
    id = trimmed.toLowerCase();
  } else {
    id = await generateUniqueCloudflareId(role);
  }

  await ensureR2UserFolders(id, role);
  return id;
}

export async function initRegistrationStorage(role: RegistrationStorageRole): Promise<{
  cloudflareId: string;
  uploadPrefix: string;
  subfolders: ReturnType<typeof registrationUploadHints>['subfolders'];
}> {
  const cloudflareId = await provisionAccountStorage(role);
  const hints = registrationUploadHints(role, cloudflareId);
  return {
    cloudflareId,
    uploadPrefix: hints.basePrefix,
    subfolders: hints.subfolders,
  };
}

export function assertUploadSubfolderAllowed(
  role: RegistrationStorageRole,
  cloudflareId: string,
  subfolder: string
): void {
  const normalized = subfolder.replace(/^\/+|\/+$/g, '');
  const prefix = `${storageRoleFolder(role)}/${cloudflareId}`;
  if (!normalized.startsWith(prefix)) {
    throw new Error(`subfolder must start with ${prefix}`);
  }
}
