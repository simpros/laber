import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";
import { useActivity } from "@/lib/activity";

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

/**
 * Pending hides every notice — single and multi alike. React Query keeps
 * sticky per-mutation errors, so without this gate a retry shows the old
 * failure for the whole request. Pages must not `reset()` before
 * `mutate`/`mutateAsync` to paper over that; the notice owns it. (`reset()`
 * survives only where cancel must clear a notice without a new mutation.)
 */
export function shouldHideNotice(
  mutation: Pick<NoticeMutation, "isPending">,
): boolean {
  return mutation.isPending;
}

function SingleNotice({
  mutation,
  errorFallback,
  onViewActivity,
}: {
  mutation: NoticeMutation;
  errorFallback: string;
  onViewActivity?: () => void;
}) {
  if (shouldHideNotice(mutation)) return null;
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

type ActivityLink = {
  /** Explicit opener; wins over `linkActivity` when both are passed. */
  onViewActivity?: () => void;
  /** Wire the Activity pointer to `useActivity().setOpen(true)` without the
   * page importing the activity module for a one-liner callback. */
  linkActivity?: boolean;
};

type SingleMutationProps = ActivityLink & {
  mutation: NoticeMutation;
  errorFallback: string;
  mutations?: never;
};

type MultiMutationProps = ActivityLink & {
  mutations: MutationNoticeSource[];
  mutation?: never;
  errorFallback?: never;
};

/**
 * The one mutation notice: success copy comes from `mutation.data` (hooks
 * resolve to their display message, `null` = silent success), failures from
 * `mutation.error`. Single-mutation surfaces pass `mutation` +
 * `errorFallback`; multi-mutation surfaces pass `mutations` and the notice
 * shows the latest-settled terminal state. Any pending hides stale notices
 * on both paths — so pages never choreograph sibling `reset()` calls and
 * never `reset()` themselves before firing.
 * Lifecycle ops (deploy/stop/restart) render through this too —
 * `linkActivity` (or `onViewActivity`) adds the Activity pointer instead of
 * a second hand-rolled Alert.
 */
export function MutationNotice(props: SingleMutationProps | MultiMutationProps) {
  const { setOpen } = useActivity();
  const onViewActivity =
    props.onViewActivity ?? (props.linkActivity ? () => setOpen(true) : undefined);
  if (props.mutations) {
    const mutations = props.mutations;
    if (mutations.some(({ mutation: m }) => shouldHideNotice(m))) return null;
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
