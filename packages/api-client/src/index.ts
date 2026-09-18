import { treaty, type Treaty } from "@elysiajs/eden";
import type { App } from "@laber/server/api-type";

export type ApiClient = Treaty.Create<App>;

export type ApiClientOptions = {
  /**
   * Forward the incoming `cookie` header so the API sees the caller's
   * session:
   *
   * ```ts
   * createApiClient(url, { headers: { cookie: req.headers.get("cookie") ?? "" } })
   * ```
   */
  headers?: Treaty.Config["headers"];
  /** Injectable fetch for tests. */
  fetcher?: Treaty.Config["fetcher"];
  onRequest?: Treaty.Config["onRequest"];
  onResponse?: Treaty.Config["onResponse"];
};

export function createApiClient(
  baseUrl: string,
  options: ApiClientOptions = {}
): ApiClient {
  return treaty<App>(baseUrl, {
    headers: options.headers,
    fetcher: options.fetcher,
    onRequest: options.onRequest,
    onResponse: options.onResponse,
  });
}
