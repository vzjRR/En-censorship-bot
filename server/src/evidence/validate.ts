import { env } from "../config/env.js";

export type EvidenceKind = "IMAGE" | "VIDEO";

interface Signature {
  kind: EvidenceKind;
  mimetypes: string[];
  extensions: string[];
  matches: (buf: Buffer) => boolean;
}

// Magic-byte signatures so we never trust a client-supplied extension or
// Content-Type header alone (per platform security requirement).
const SIGNATURES: Signature[] = [
  {
    kind: "IMAGE",
    mimetypes: ["image/png"],
    extensions: [".png"],
    matches: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    kind: "IMAGE",
    mimetypes: ["image/jpeg", "image/jpg"],
    extensions: [".jpg", ".jpeg"],
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    kind: "IMAGE",
    mimetypes: ["image/webp"],
    extensions: [".webp"],
    matches: (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
  },
  {
    kind: "IMAGE",
    mimetypes: ["image/gif"],
    extensions: [".gif"],
    matches: (b) => b.length > 6 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a"),
  },
  {
    kind: "VIDEO",
    mimetypes: ["video/mp4"],
    extensions: [".mp4", ".m4v", ".mov"],
    matches: (b) => b.length > 12 && b.toString("ascii", 4, 8) === "ftyp",
  },
  {
    kind: "VIDEO",
    mimetypes: ["video/webm"],
    extensions: [".webm"],
    matches: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
  {
    kind: "VIDEO",
    mimetypes: ["video/quicktime"],
    extensions: [".mov"],
    matches: (b) => b.length > 12 && b.toString("ascii", 4, 12).includes("qt"),
  },
];

export interface EvidenceValidationInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface ValidatedEvidence {
  kind: EvidenceKind;
  extension: string;
}

export class EvidenceValidationError extends Error {}

export function validateEvidenceFile(file: EvidenceValidationInput): ValidatedEvidence {
  const maxBytes = env.MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new EvidenceValidationError(`File "${file.originalname}" exceeds the ${env.MAX_EVIDENCE_FILE_SIZE_MB}MB size limit.`);
  }
  if (file.size === 0) {
    throw new EvidenceValidationError(`File "${file.originalname}" is empty.`);
  }

  const extension = "." + (file.originalname.split(".").pop() ?? "").toLowerCase();
  const signature = SIGNATURES.find((sig) => sig.matches(file.buffer));

  if (!signature) {
    throw new EvidenceValidationError(
      `File "${file.originalname}" is not a recognized image or video format (extension/MIME type are not trusted — content is inspected directly).`,
    );
  }

  if (!signature.extensions.includes(extension) && extension !== "") {
    // Extension disagrees with actual content — reject rather than guess.
    throw new EvidenceValidationError(`File "${file.originalname}" content does not match its extension.`);
  }

  return { kind: signature.kind, extension: signature.extensions[0] };
}
