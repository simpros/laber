import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";

type NoticeMutation = {
  data: string | null | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  // Optional because React Query's idle variant omits the clocks; an idle
  // mutation is never `isSuccess`/`isError`, so it still settles as 0 below.
  /** TanStack settlement clocks; latest-settled wins in multi-notices. */
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
};

export type { NoticeMutation };

export type MutationNoticeSource = {
  mutation: NoticeMutation;
  errorFallback: string;
};

function SingleNotice({
  mutation,
  errorFallback,
  onViewActivity,
}: {
  mutation: NoticeMutation;
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
 * array order would resurrect them). Settlement keys off `isSuccess` /
 * `isError` — never truthy `data` — because silent successes resolve `null`
 * on purpose and must still clear older sibling errors. Unsettled sources
 * sort as 0. */
export function latestSettled(
  mutations: MutationNoticeSource[],
): MutationNoticeSource | undefined {
  let best: MutationNoticeSource | undefined;
  let bestAt = 0;
  for (const source of mutations) {
    const { mutation } = source;
    const settledAt = mutation.isError
      ? (mutation.errorUpdatedAt ?? 0)
      : mutation.isSuccess
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
  mutation: NoticeMutation;
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
