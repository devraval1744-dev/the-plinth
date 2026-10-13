/**
 * Storage service abstraction for The Plinth.
 *
 * Currently implements LOCAL filesystem storage for development.
 * To swap to S3, Cloudinary, Firebase, GCS etc.:
 *   - Implement the StorageService interface below
 *   - Replace `localStorageService` with the cloud implementation
 *   - Keep the same public API — no caller changes needed
 */

import fs from 'fs';
import path from 'path';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface StoredFile {
  url: string;         // Public-accessible URL or server-relative path
  storagePath: string; // Internal storage key/path (for deletion)
  fileName: string;    // Sanitised filename that was stored
  fileSizeBytes: number;
  fileMimeType: string;
}

export interface StorageService {
  save(file: UploadedFile, subfolder: string): Promise<StoredFile>;
  delete(storagePath: string): Promise<void>;
  getUrl(storagePath: string): string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ALLOWED_BLUEPRINT_MIMETYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png':       'png',
  'image/jpeg':      'jpg',
  'image/jpg':       'jpg',
  'image/webp':      'webp',
};

export const MAX_BLUEPRINT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// ─── Local storage implementation ─────────────────────────────────────────────

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitiseFilename(original: string): string {
  return original
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 200);
}

const localStorageService: StorageService = {
  async save(file: UploadedFile, subfolder: string): Promise<StoredFile> {
    const dir = path.join(UPLOADS_ROOT, subfolder);
    ensureDir(dir);

    const timestamp   = Date.now();
    const sanitised   = sanitiseFilename(file.originalname);
    const uniqueName  = `${timestamp}_${sanitised}`;
    const storagePath = path.join('uploads', subfolder, uniqueName);
    const fullPath    = path.join(UPLOADS_ROOT, subfolder, uniqueName);

    await fs.promises.writeFile(fullPath, new Uint8Array(file.buffer));

    return {
      url:           `/uploads/${subfolder}/${uniqueName}`,
      storagePath,
      fileName:      file.originalname,
      fileSizeBytes: file.size,
      fileMimeType:  file.mimetype,
    };
  },

  async delete(storagePath: string): Promise<void> {
    const fullPath = path.resolve(process.cwd(), storagePath);
    try {
      await fs.promises.unlink(fullPath);
    } catch {
      // Silently ignore — file may already be gone
    }
  },

  getUrl(storagePath: string): string {
    // Converts storage path to a server-relative URL
    return `/${storagePath.replace(/\\/g, '/')}`;
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The single storage instance used by all services.
 * Replace this assignment to switch providers.
 */
export const storageService: StorageService = localStorageService;

export const ALLOWED_PROPERTY_IMAGE_MIMETYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

export const MAX_PROPERTY_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function validateBlueprintFile(mimetype: string, sizeBytes: number): void {
  if (!ALLOWED_BLUEPRINT_MIMETYPES[mimetype]) {
    const err: any = new Error(
      `Unsupported file type: ${mimetype}. Allowed types: PDF, PNG, JPG/JPEG, WEBP.`
    );
    err.statusCode = 422;
    throw err;
  }
  if (sizeBytes > MAX_BLUEPRINT_SIZE_BYTES) {
    const err: any = new Error(
      `File too large. Maximum allowed size is ${MAX_BLUEPRINT_SIZE_BYTES / 1024 / 1024} MB.`
    );
    err.statusCode = 422;
    throw err;
  }
}

export function validatePropertyImageFile(mimetype: string, sizeBytes: number): void {
  if (!ALLOWED_PROPERTY_IMAGE_MIMETYPES[mimetype]) {
    const err: any = new Error(
      `Unsupported image type: ${mimetype}. Allowed types: JPG, JPEG, PNG, WEBP.`
    );
    err.statusCode = 422;
    throw err;
  }
  if (sizeBytes > MAX_PROPERTY_IMAGE_SIZE_BYTES) {
    const err: any = new Error(
      `Image file too large. Maximum allowed size is ${MAX_PROPERTY_IMAGE_SIZE_BYTES / 1024 / 1024} MB.`
    );
    err.statusCode = 422;
    throw err;
  }
}
