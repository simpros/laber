import { useEffect, useState } from "react";
import { Button } from "@laber/ui";
import { useSaveStackCompose } from "@/lib/queries/stacks";
import MutationNotice from "@/components/MutationNotice";
import { Icon } from "@laber/ui";

export function StackComposeView({
  content,
  fileName,
  stackName,
}: {
  content: string;
  fileName: string;
  stackName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  // The parent remounts per stack (`key={name}`); this only covers a
  // background refetch while viewing. Never clobber an in-progress edit.
  useEffect(() => {
    if (!editing) setDraft(content);
  }, [content, editing]);

  const saveMutation = useSaveStackCompose(stackName, () =>
    setEditing(false),
  );

  function toggleEditing() {
    setDraft(content);
    // Cancel-path clear without a new mutation: the one `reset()` that
    // survives the notice-owned pending gate (the notice is unmounted with
    // the edit surface on close, so this only matters when reopening).
    saveMutation.reset();
    setEditing((v) => !v);
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-surface-2 border-border overflow-hidden rounded-lg border">
      <div className="border-border flex items-center justify-between border-b px-4 py-2">
        <span className="text-text-secondary font-mono text-xs">
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleEditing}
            className="text-text-muted hover:text-text-secondary flex items-center gap-1 text-xs transition-colors"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            className="text-text-muted hover:text-text-secondary flex items-center gap-1 text-xs transition-colors"
          >
            <Icon>
              {copied ? (
                <path d="M4 8l3 3 5-6" />
              ) : (
                <path d="M5 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5M5 2h4l3 3v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
              )}
            </Icon>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {editing ? (
        <div className="p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={24}
            className="w-full font-mono text-xs"
          />
          <MutationNotice mutation={saveMutation} errorFallback="Save failed" />
          <div className="mt-2 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(draft)}
            >
              {saveMutation.isPending ? "Saving..." : "Save Compose"}
            </Button>
          </div>
        </div>
      ) : (
        <pre className="text-text-primary overflow-auto p-4 font-mono text-xs leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}

export default StackComposeView;
