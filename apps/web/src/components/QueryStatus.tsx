import type { ReactNode } from "react";

type QueryState<T> = {
  isPending?: boolean;
  isLoading?: boolean;
  isError: boolean;
  data: T | undefined;
  error: unknown;
};

/**
 * The one loading/failed gate for every resource page. Render-prop narrows
 * `data`, so pages never repeat the Loading… / Failed-to-load block and
 * never reach for a cast after the gate.
 *
 * Cold load and background refetch are different products: a refetch that
 * fails while a snapshot is on screen keeps the page (with a banner) so
 * in-progress editor state survives a flaky invalidate. Only a cold miss —
 * pending with nothing to show, or settled with no data — replaces the
 * page.
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
  const pending = query.isPending ?? query.isLoading ?? false;
  if (pending && query.data == null) {
    return <p className="text-text-muted text-sm">Loading…</p>;
  }
  if (query.data == null) {
    return (
      <p className="text-danger text-sm">
        {query.error instanceof Error ? query.error.message : failedMessage}
      </p>
    );
  }
  return (
    <>
      {query.isError && (
        <p className="text-danger mb-4 text-sm" role="alert">
          Refresh failed — showing the last saved snapshot.{" "}
          {query.error instanceof Error ? query.error.message : failedMessage}
        </p>
      )}
      {children(query.data)}
    </>
  );
}

export default QueryStatus;
