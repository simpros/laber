import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";

type MutationState = {
  data: string | null | undefined;
  isError: boolean;
  isPending?: boolean;
  error: unknown;
  /** TanStack settlement clocks; latest-settled wins in multi-notices. */
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
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

/** Newest terminal state across the group, so a later success hides an
 * older sibling failure (React Query keeps sticky per-mutation errors, and
 * array order would resurrect them). Unsettled sources sort as 0. */
function latestSettled(
  mutations: MutationNoticeSource[],
): MutationNoticeSource | undefined {
  let best: MutationNoticeSource | undefined;
  let bestAt = 0;
  for (const source of mutations) {
    const { mutation } = source;
    const settledAt = mutation.isError
      ? (mutation.errorUpdatedAt ?? 0)
      : mutation.data
        ? (mutation.dataUpdatedAt ?? 0)
        : 0;
    if (settledAt > 0 && settledAt >= bestAt) {
      best = source;
      bestAt = settledAt;
    }
  }
  return best;
}

type SingleMutationProps = {
  mutation: MutationState;
  errorFallback: string;
  mutations?: never;
  onViewActivity?: () => void;
};

type MultiMutationProps = {
  mutations: MutationNoticeSource[];
  mutation?: never;
  errorFallback?: never;
  onViewActivity?: () => void;
};

/**
 * The one mutation notice: success copy comes from `mutation.data` (hooks
 * resolve to their display message, `null` = silent success), failures from
 * `mutation.error`. Single-mutation surfaces pass `mutation` +
 * `errorFallback`; multi-mutation surfaces pass `mutations` and the notice
 * shows the latest-settled terminal state — any pending hides stale
 * notices — so pages never choreograph sibling `reset()` calls.
 * Lifecycle ops (deploy/stop/restart) render through this too —
 * `onViewActivity` adds the Activity pointer instead of a second hand-rolled
 * Alert.
 */
export function MutationNotice(props: SingleMutationProps | MultiMutationProps) {
  const { onViewActivity } = props;
  if (props.mutations) {
    const mutations = props.mutations;
    if (mutations.some(({ mutation: m }) => m.isPending)) return null;
    const settled = latestSettled(mutations);
    if (!settled) return null;
    return (
      <SingleNotice
        mutation={settled.mutation}
        errorFallback={settled.errorFallback}
        onViewActivity={onViewActivity}
      />
    );
  }
  return (
    <SingleNotice
      mutation={props.mutation}
      errorFallback={props.errorFallback}
      onViewActivity={onViewActivity}
    />
  );
}

export default MutationNotice;
