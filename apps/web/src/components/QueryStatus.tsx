import type { ReactNode } from "react";

type QueryState<T> = {
  isPending?: boolean;
  isLoading?: boolean;
  isError: boolean;
  data: T | undefined;
  error: unknown;
};

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
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <div className="space-y-2">
          <div className="skeleton h-7 w-48"></div>
          <div className="skeleton h-4 w-72 max-w-full"></div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24"></div>
          ))}
        </div>
        <div className="skeleton h-56"></div>
      </div>
    );
  }
  if (query.data == null) {
    return (
      <div className="bg-danger/5 border-danger/20 text-danger rounded-xl border p-4 text-sm">
        {query.error instanceof Error
          ? query.error.message
          : failedMessage}
      </div>
    );
  }
  return (
    <>
      {query.isError && (
        <p
          className="bg-danger/5 border-danger/20 text-danger mb-4 rounded-xl border p-3 text-sm"
          role="alert"
        >
          Refresh failed — showing the last saved snapshot.{" "}
          {query.error instanceof Error
            ? query.error.message
            : failedMessage}
        </p>
      )}
      {children(query.data)}
    </>
  );
}

export default QueryStatus;
