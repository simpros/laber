import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";

type MutationState = {
  data: string | null | undefined;
  isError: boolean;
  isPending?: boolean;
  error: unknown;
};

export type MutationNoticeSource = {
  mutation: MutationState;
  errorFallback: string;
};

function SingleNotice({
  mutation,
  errorFallback,
  onViewActivity,
}: {
  mutation: MutationState;
  errorFallback: string;
  onViewActivity?: () => void;
}) {
  if (mutation.data) {
    return (
      <Alert variant="success">
        {mutation.data}{" "}
        {onViewActivity && (
          <button
            type="button"
            onClick={onViewActivity}
            className="underline underline-offset-2"
          >
            View activity
          </button>
        )}
      </Alert>
    );
  }
  if (mutation.isError) {
    return (
      <Alert variant="error">
        {toErrorMessage(mutation.error, errorFallback)}
      </Alert>
    );
  }
  return null;
}

/**
 * The one mutation notice: success copy comes from `mutation.data` (hooks
 * resolve to their display message, `null` = silent success), failures from
 * `mutation.error`. Single-mutation surfaces pass `mutation`; multi-mutation
 * surfaces pass `mutations` and the notice picks one coherent Alert — any
 * pending hides stale notices, otherwise the first error wins, then the
 * first success — so pages never choreograph sibling `reset()` calls.
 * Lifecycle ops (deploy/stop/restart) render through this too —
 * `onViewActivity` adds the Activity pointer instead of a second hand-rolled
 * Alert.
 */
export function MutationNotice({
  mutation,
  errorFallback,
  mutations,
  onViewActivity,
}: {
  mutation?: MutationState;
  errorFallback?: string;
  mutations?: MutationNoticeSource[];
  onViewActivity?: () => void;
}) {
  if (mutations) {
    if (mutations.some(({ mutation: m }) => m.isPending)) return null;
    const failed = mutations.find(({ mutation: m }) => m.isError);
    if (failed) {
      return (
        <SingleNotice
          mutation={failed.mutation}
          errorFallback={failed.errorFallback}
        />
      );
    }
    const succeeded = mutations.find(({ mutation: m }) => m.data);
    if (succeeded) {
      return (
        <SingleNotice
          mutation={succeeded.mutation}
          errorFallback={succeeded.errorFallback}
          onViewActivity={onViewActivity}
        />
      );
    }
    return null;
  }
  if (!mutation || !errorFallback) return null;
  return (
    <SingleNotice
      mutation={mutation}
      errorFallback={errorFallback}
      onViewActivity={onViewActivity}
    />
  );
}

export default MutationNotice;
