import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, isAbsolute, join, resolve, sep } from 'path';

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

const ALLOWED_MIME = /^image\/(jpeg|png|webp|gif|avif)$/;

export interface StoredFile {
  url: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit

@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(process.cwd(), config.get<string>('storage.localDir') ?? 'uploads');
  }

  /**
   * Persists a single uploaded file under `uploads/{folder}` and returns its
   * public URL. Storage provider is swappable later via `storage.provider`
   * (e.g. S3-compatible) without touching callers.
   */
  async saveFile(file: Express.Multer.File, folder = 'images'): Promise<StoredFile> {
    if (!file?.buffer) throw new BadRequestException('No file received');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }
    const mime = (file.mimetype ?? '').toLowerCase();
    if (!ALLOWED_MIME.test(mime)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, GIF, or AVIF images are allowed');
    }
    const ext = IMAGE_EXT[mime] ?? extname(file.originalname ?? '') ?? '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const dir = join(this.root, folder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), file.buffer);
    return { url: `/uploads/${folder}/${filename}` };
  }

  /**
   * Removes a previously stored file by its public URL. Silently ignores
   * URLs that don't point into the uploads root (e.g. seeded/external URLs).
   */
  async deleteByUrl(url: string): Promise<void> {
    if (!url || !url.startsWith('/uploads/')) return;
    const rel = url.replace(/^\/uploads\//, '');
    const target = resolve(this.root, rel);
    const within = target === this.root || target.startsWith(this.root + sep);
    if (!within || isAbsolute(rel) || rel.includes('..')) return;
    try {
      await unlink(target);
    } catch {
      // File may already be gone — deletion is best-effort.
    }
  }
}