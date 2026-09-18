import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";
import { useActivity } from "@/lib/activity";

type NoticeMutation = {
  data: string | null | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
};

export type { NoticeMutation };

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

export function MutationNotice({
  mutation,
  errorFallback,
  onViewActivity,
  linkActivity,
}: {
  mutation: NoticeMutation;
  errorFallback: string;
  onViewActivity?: () => void;
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
