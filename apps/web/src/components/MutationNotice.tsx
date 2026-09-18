import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";

type MutationState = {
  data: string | null | undefined;
  isError: boolean;
  error: unknown;
};

/**
 * The one mutation notice: success copy comes from `mutation.data` (hooks
 * resolve to their display message, `null` = silent success), failures from
 * `mutation.error`. Clearing a sibling is `other.reset()` before firing, so
 * at most one notice is ever visible. Lifecycle ops (deploy/stop/restart)
 * render through this too — `onViewActivity` adds the Activity pointer
 * instead of a second hand-rolled Alert.
 */
export function MutationNotice({
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

export default MutationNotice;
