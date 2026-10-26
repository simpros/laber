import { Alert } from "@laber/ui";
import { toErrorMessage } from "@/lib/queries/actions";
import { useActivity } from "@/lib/activity";

type NoticeMutation = {
  data: string | null | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
};

export type { NoticeMutation };

export function noticeFor(
  mutation: NoticeMutation
):
  | { kind: "hidden" }
  | { kind: "success"; text: string }
  | { kind: "error"; error: unknown } {
  if (mutation.isPending) return { kind: "hidden" };
  if (mutation.data) return { kind: "success", text: mutation.data };
  if (mutation.isError) return { kind: "error", error: mutation.error };
  return { kind: "hidden" };
}

function MutationNotice({
  mutation,
  errorFallback,
  linkActivity,
}: {
  mutation: NoticeMutation;
  errorFallback: string;
  linkActivity?: boolean;
}) {
  const { setOpen } = useActivity();
  const notice = noticeFor(mutation);
  if (notice.kind === "hidden") return null;
  if (notice.kind === "success") {
    return (
      <Alert variant="success">
        {notice.text}{" "}
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
  return (
    <Alert variant="error">
      {toErrorMessage(notice.error, errorFallback)}
    </Alert>
  );
}

export default MutationNotice;
