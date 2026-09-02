import type { Request, Response, NextFunction } from "express";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "not_found", message: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  console.error(`[error] ${req.method} ${req.path}:`, err);
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  res.status(500).json({ error: "internal_error", message: process.env.NODE_ENV === "production" ? "Unexpected server error." : message });
}
