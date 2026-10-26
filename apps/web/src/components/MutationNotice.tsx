import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";
import { useActivity } from "@/lib/activity";

type NoticeMutation = {
  data: string | null | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
};

export type { NoticeMutation };

export function MutationNotice({
  mutation,
  errorFallback,
  linkActivity,
}: {
  mutation: NoticeMutation;
  errorFallback: string;
  linkActivity?: boolean;
}) {
  const { setOpen } = useActivity();
  if (mutation.isPending) return null;
  if (mutation.data) {
    return (
      <Alert variant="success">
        {mutation.data}{" "}
        {linkActivity && (
          <button
            type="button"
            onClick={() => setOpen(true)}
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
