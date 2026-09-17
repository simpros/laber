import { createApiClient, type ApiClient } from "@laber/api-client";

/**
 * Same-origin treaty client. Vite proxies `/api/*` to the Elysia backend
 * (dev + preview), so the browser never needs a second origin and session
 * cookies flow as first-party. `credentials: "same-origin"` is fetch's
 * default, which is exactly what we want — no cross-origin cookie config.
 */
let cached: ApiClient | null = null;

export function getApiClient(baseUrl?: string): ApiClient {
  if (baseUrl) {
    return createApiClient(baseUrl);
  }
  if (!cached) {
    // Same-origin in the browser (Vite proxies `/api/*` to Elysia).
    // `window.location.origin` keeps treaty URL construction absolute;
    // an empty base breaks Eden's URL joining and surfaces as "Request failed".
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    cached = createApiClient(origin);
  }
  return cached;
}

export const api = getApiClient();

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Unwrap an Eden `{ data, error }` union; throw ApiError on failure. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error !== null && res.error !== undefined) {
    throw toApiError(res.error);
  }
  if (res.data === null || res.data === undefined) {
    throw new ApiError("Request failed");
  }
  return res.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toApiError(error: unknown): ApiError {
  if (!isRecord(error)) return new ApiError("Request failed");
  let status: number | undefined;
  if (typeof error.status === "number") status = error.status;
  const value = error.value;
  if (isRecord(value) && typeof value.error === "string") {
    return new ApiError(value.error, status);
  }
  return new ApiError("Request failed", status);
}
