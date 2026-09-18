import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";
import { useActivity } from "@/lib/activity";

type NoticeMutation = {
  data: string | null | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  // Idle omits the clocks but never reaches terminal state, so still renders nothing.
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
};

export type { NoticeMutation };

/** Pending hides the notice, so a retry never shows the old failure mid-flight. */
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

/** Split out so default notices stay presentational (no activity import in pages). */
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
 * The one mutation notice: success copy from `mutation.data` (`null` =
 * silent success). One mutation per notice, so a stale failure can never
 * hide behind a sibling's success.
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
  /** Wire the Activity pointer without importing the activity module. */
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
