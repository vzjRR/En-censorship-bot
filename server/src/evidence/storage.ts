import { env } from "../config/env.js";
import { validateEvidenceFile, EvidenceValidationError, type EvidenceKind } from "./validate.js";
import { storeEvidenceLocally } from "./localStorage.js";
import { sendChannelMessage } from "../bot/services/logService.js";

export { EvidenceValidationError } from "./validate.js";

export interface EvidenceFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface StoredEvidenceRecord {
  attachmentId: string | null;
  attachmentUrl: string;
  attachmentType: EvidenceKind;
  filename: string;
}

export class EvidenceStorageError extends Error {}

/**
 * Validates and persists evidence files, returning durable references
 * (attachment_id / attachment_url) to store on the warning/ban record. This
 * is treated as a precondition of the moderation action, not the Discord
 * "log message" step — a storage failure here fails the whole request
 * before anything is written to the database, so nothing is ever left in a
 * half-created state. See moderation/warnings and moderation/bans services.
 */
export async function storeEvidenceFiles(
  files: EvidenceFileInput[],
  context: { channelId: string; caption: string },
): Promise<StoredEvidenceRecord[]> {
  if (files.length === 0) return [];

  const validated = files.map((file) => {
    try {
      return { file, meta: validateEvidenceFile(file) };
    } catch (err) {
      if (err instanceof EvidenceValidationError) throw err;
      throw new EvidenceValidationError(`Failed to validate "${file.originalname}".`);
    }
  });

  if (env.EVIDENCE_STORAGE_DRIVER === "local") {
    const stored = await Promise.all(
      validated.map(async ({ file, meta }) => {
        const local = await storeEvidenceLocally(file.buffer, file.originalname, meta.kind);
        return {
          attachmentId: local.storageKey,
          attachmentUrl: local.url,
          attachmentType: meta.kind,
          filename: local.filename,
        } satisfies StoredEvidenceRecord;
      }),
    );
    return stored;
  }

  // Discord-backed storage: upload all files as attachments on a single
  // message in the moderation channel, then use the resulting CDN URLs.
  const result = await sendChannelMessage(
    context.channelId,
    context.caption,
    validated.map(({ file }) => ({ buffer: file.buffer, filename: file.originalname })),
  );

  if (result.status === "FAILED" || !result.attachments) {
    throw new EvidenceStorageError(
      `Failed to upload evidence to Discord: ${result.error ?? "unknown error"}. Please try again.`,
    );
  }

  return result.attachments.map((attachment, i) => ({
    attachmentId: attachment.id,
    attachmentUrl: attachment.url,
    attachmentType: validated[i].meta.kind,
    filename: attachment.filename,
  }));
}
