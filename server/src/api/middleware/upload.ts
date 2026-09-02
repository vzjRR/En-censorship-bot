import multer from "multer";
import { env } from "../../config/env.js";

export const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024,
    files: 5,
  },
});
