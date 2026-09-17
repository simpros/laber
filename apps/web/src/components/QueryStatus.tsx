import type { ReactNode } from "react";

type QueryState<T> = {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  error: unknown;
};

/**
 * The one loading/failed gate for every resource page. Render-prop narrows
 * `data`, so pages never repeat the Loading… / Failed-to-load block and
 * never reach for a cast after the gate.
 */
export function QueryStatus<T>({
  query,
  failedMessage,
  children,
}: {
  query: QueryState<T>;
  failedMessage: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) {
    return <p className="text-text-muted text-sm">Loading…</p>;
  }
  if (query.isError || query.data == null) {
    return (
      <p className="text-danger text-sm">
        {query.error instanceof Error ? query.error.message : failedMessage}
      </p>
    );
  }
  return <>{children(query.data)}</>;
}

export default QueryStatus;
