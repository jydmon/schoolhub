import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./session";
import { PermissionError } from "./rbac";

/** Expected, caller-facing error with an HTTP status (e.g. bad state transition). */
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

/** Convert thrown errors into a consistent JSON response. */
export function handleError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.flatten() },
      { status: 400 }
    );
  }
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof PermissionError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Extract a best-effort client IP from request headers. */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export function ok(data: unknown, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(data, { status, headers });
}
