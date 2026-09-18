import type { ReactNode } from "react";

type QueryState<T> = {
  isPending?: boolean;
  isLoading?: boolean;
  isError: boolean;
  data: T | undefined;
  error: unknown;
};

/**
 * The one loading/failed gate: a failed refetch keeps the snapshot (plus
 * banner) so editor state survives a flaky invalidate; only a cold miss
 * replaces the page.
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
