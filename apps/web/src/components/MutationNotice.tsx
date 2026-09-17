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
 * at most one notice is ever visible.
 */
export function MutationNotice({
  mutation,
  errorFallback,
}: {
  mutation: MutationState;
  errorFallback: string;
}) {
  if (mutation.data) {
    return <Alert variant="success">{mutation.data}</Alert>;
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
