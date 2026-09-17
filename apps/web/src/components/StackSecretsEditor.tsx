import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Icon } from "@laber/ui";
import { api, unwrap } from "@/lib/api";
import {
  isUnset,
  valueForSave,
  markSaved,
  type MaskedSecretState,
} from "@/lib/masked-secret";
import SecretBadge from "@/components/SecretBadge";

type SecretEntry = {
  name: string;
  filePath: string;
  services: string[];
  hasValue: boolean;
};

type Row = MaskedSecretState & {
  name: string;
  filePath: string;
  services: string[];
};

export default function StackSecretsEditor({
  secrets,
  stackName,
}: {
  secrets: SecretEntry[];
  stackName: string;
}) {
  const queryClient = useQueryClient();
  // Owned by stack identity: the parent remounts per stack (`key={name}`),
  // so initializing from props once is correct — no fingerprint dance.
  const [entries, setEntries] = useState<Row[]>(() =>
    secrets.map((s) => ({
      name: s.name,
      filePath: s.filePath,
      services: s.services,
      hadValue: s.hasValue,
      value: "",
      dirty: false,
    }))
  );

  const unsetCount = entries.filter(isUnset).length;

  const saveMutation = useMutation({
    mutationFn: async (
      payload: Array<{ name: string; value: string | null }>
    ) => {
      const res = await api.api
        .stacks({ name: stackName })
        .secrets.put({ entries: payload });
      return unwrap(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stack", stackName] });
      setEntries((prev) => prev.map((e) => ({ ...e, ...markSaved(e) })));
    },
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await saveMutation.mutateAsync(
      entries.map((e) => ({
        name: e.name,
        value: valueForSave(e),
      }))
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-text-muted py-8 text-center text-sm">
        No secrets defined in compose file.
      </div>
    );
  }

  return (
    <form onSubmit={handleSave}>
      <div className="space-y-3">
        {unsetCount > 0 && (
          <div className="border-warning/30 bg-warning/5 flex items-center gap-2 rounded-lg border px-3 py-2">
            <Icon className="text-warning shrink-0">
              <path d="M8 1a1 1 0 0 1 .867.5l6.928 12A1 1 0 0 1 14.928 15H1.072a1 1 0 0 1-.867-1.5l6.928-12A1 1 0 0 1 8 1ZM8 5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5Zm0 8a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
            </Icon>
            <span className="text-warning text-xs">
              {unsetCount} secret{unsetCount > 1 ? "s" : ""} without a
              value — deploy will skip writing{" "}
              {unsetCount > 1 ? "them" : "it"}
            </span>
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.name}
            className="bg-surface-2 border-border rounded-lg border p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <Icon className="text-accent shrink-0">
                <path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4ZM6 5a2 2 0 1 1 4 0v2H6V5Zm2 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
              </Icon>
              <span className="font-mono text-sm font-medium">
                {entry.name}
              </span>
              <SecretBadge entry={entry} />
            </div>

            <div className="flex items-center gap-2">
              <input
                value={entry.value}
                onChange={(e) =>
                  setEntries((prev) =>
                    prev.map((x) =>
                      x.name === entry.name
                        ? { ...x, value: e.target.value, dirty: true }
                        : x
                    )
                  )
                }
                placeholder={
                  entry.hadValue && !entry.dirty
                    ? "Leave empty to keep the current value…"
                    : "Enter secret value…"
                }
                type="password"
                className="flex-1 font-mono text-xs"
              />
              {entry.dirty && (
                <button
                  type="button"
                  onClick={() =>
                    setEntries((prev) =>
                      prev.map((x) =>
                        x.name === entry.name
                          ? { ...x, value: "", dirty: false }
                          : x
                      )
                    )
                  }
                  className="text-text-muted hover:text-danger p-1 transition-colors"
                  aria-label="Reset"
                  title="Undo changes"
                >
                  <Icon>
                    <path
                      d="M2.5 2v4.5h4.5M2.87 8a5.5 5.5 0 1 0 1.01-3.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Icon>
                </button>
              )}
            </div>

            <div className="text-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <span className="font-mono">{entry.filePath}</span>
              {entry.services.length > 0 && (
                <span>Used by {entry.services.join(", ")}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {saveMutation.isError && (
        <p className="text-danger mt-2 text-sm">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Save failed"}
        </p>
      )}

      <div className="mt-4">
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : "Save Secrets"}
        </Button>
      </div>
    </form>
  );
}
