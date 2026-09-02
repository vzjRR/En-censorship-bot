import { nanoid } from "nanoid";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvidenceKind } from "./validate.js";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

export interface StoredLocalFile {
  storageKey: string;
  url: string;
  filename: string;
}

/**
 * Development/self-hosted fallback for evidence storage — writes to local
 * disk instead of Discord's CDN. Swappable behind the same shape a future
 * S3/R2 driver would implement (store bytes, return a stable reference),
 * so callers never need to change when the backing store changes.
 */
export async function storeEvidenceLocally(
  buffer: Buffer,
  originalname: string,
  _kind: EvidenceKind,
): Promise<StoredLocalFile> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `${nanoid(16)}-${safeName}`;
  await writeFile(path.join(UPLOADS_DIR, storageKey), buffer);
  return { storageKey, url: `/api/evidence/local/${storageKey}`, filename: originalname };
}
