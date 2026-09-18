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
  // mutation is never `isSuccess`/`isError`, so it still renders nothing.
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
};

export type { NoticeMutation };

/**
 * Pending hides the notice. Mutations clear their own terminal state when
 * a new submit starts (`useApiMutation` resets on `mutate`), so without
 * this gate a retry shows the old failure for the whole request. Pages
 * never `reset()` before firing; the notice owns it. (`reset()` survives
 * only where cancel must clear a notice without a new mutation.)
 */
export function shouldHideNotice(
  mutation: Pick<NoticeMutation, "isPending">,
): boolean {
  return mutation.isPending;
}

function NoticeBody({
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

/**
 * Activity-linked notice: the only component that touches the SSE module.
 * Split out so default notices stay presentational — lifecycle surfaces
 * pass `linkActivity` instead of importing `useActivity` for a one-liner
 * callback.
 */
function LinkedNotice({
  mutation,
  errorFallback,
}: {
  mutation: NoticeMutation;
  errorFallback: string;
}) {
  const { setOpen } = useActivity();
  return (
    <NoticeBody
      mutation={mutation}
      errorFallback={errorFallback}
      onViewActivity={() => setOpen(true)}
    />
  );
}

/**
 * The one mutation notice: success copy comes from `mutation.data` (hooks
 * resolve to their display message, `null` = silent success), failures from
 * `mutation.error`. One mutation per notice — multi-mutation surfaces render
 * one small notice per action instead of a latest-settled group, so no
 * sibling choreography and no union props. Lifecycle ops (deploy/stop/
 * restart) render through this too — `linkActivity` (or `onViewActivity`)
 * adds the Activity pointer instead of a second hand-rolled Alert.
 */
export function MutationNotice({
  mutation,
  errorFallback,
  onViewActivity,
  linkActivity,
}: {
  mutation: NoticeMutation;
  errorFallback: string;
  /** Explicit opener; wins over `linkActivity` when both are passed. */
  onViewActivity?: () => void;
  /** Wire the Activity pointer without the page importing the activity module. */
  linkActivity?: boolean;
}) {
  if (onViewActivity) {
    return (
      <NoticeBody
        mutation={mutation}
        errorFallback={errorFallback}
        onViewActivity={onViewActivity}
      />
    );
  }
  if (linkActivity) {
    return <LinkedNotice mutation={mutation} errorFallback={errorFallback} />;
  }
  return <NoticeBody mutation={mutation} errorFallback={errorFallback} />;
}

export default MutationNotice;
