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
  if (res.error) {
    const err = res.error as { status?: number; value?: unknown };
    const value = err.value as { error?: string } | undefined;
    const message =
      typeof value?.error === "string" ? value.error : "Request failed";
    throw new ApiError(message, err.status);
  }
  return res.data as T;
}
