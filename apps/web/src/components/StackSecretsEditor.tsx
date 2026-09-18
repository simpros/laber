import { useMemo } from "react";
import { Button, Icon } from "@laber/ui";
import {
  clearSecretEntry,
  isUnset,
  maskedFromServer,
  undoSecretEntry,
  valueForSave,
  type MaskedSecretState,
  type Secrecy,
} from "@/lib/masked-secret";
import { useMaskedListEditor } from "@/lib/use-masked-list-editor";
import {
  stackSecretsSave,
  type StackSecretPayload,
} from "@/lib/queries/stacks";
import SecretBadge from "@/components/SecretBadge";
import MutationNotice from "@/components/MutationNotice";
import { MaskedSecretField } from "@/components/MaskedSecretField";

export type SecretEntry = {
  name: string;
  filePath: string;
  services: string[];
  hasValue: boolean;
};

export type SecretRow = MaskedSecretState & {
  name: string;
  filePath: string;
  services: string[];
  /** Always-secret rows; never `demote-pending`. */
  secrecy: Secrecy;
};

// Module-level so the list-editor sync identity never thrashes.
function secretKeyOf(e: Pick<SecretRow, "name">): string {
  return e.name;
}

// One builder for mount and echo snapshots so the two can't drift.
export function rowForSecret(s: SecretEntry): SecretRow {
  return {
    ...maskedFromServer({ isSecret: true, hasValue: s.hasValue }),
    name: s.name,
    filePath: s.filePath,
    services: s.services,
  };
}

export default function StackSecretsEditor({
  secrets,
  stackName,
}: {
  secrets: SecretEntry[];
  stackName: string;
}) {
  // Parent remounts per stack (`key={name}`), so prop-init is correct.
  const serverValues = useMemo(() => secrets.map(rowForSecret), [secrets]);
  const { entries, update, touch, saveMutation, handleSave } =
    useMaskedListEditor<SecretRow, StackSecretPayload>({
      init: () => secrets.map(rowForSecret),
      syncValues: serverValues,
      keyOf: secretKeyOf,
      toPayload: (rows) =>
        rows.map((entry) => ({
          name: entry.name,
          value: valueForSave(entry),
        })),
      save: stackSecretsSave(stackName),
    });

  const unsetCount = entries.filter(isUnset).length;

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
              <path d="M8 1a1 1 0 0 1 .867.5l6.928 12A1 1 0 0 1 14.928 15H1.072a1 1 0 0 1-.867-1.5l6.928-12A1 1 0 0 1 8 1ZM8 5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5Zm0 8a.75.75 0 1 0 0-1.5.75.75 0 1 0 0 1.5Z" />
            </Icon>
            <span className="text-warning text-xs">
              {unsetCount} secret{unsetCount > 1 ? "s" : ""} without a
              value — deploy will skip writing{" "}
              {unsetCount > 1 ? "them" : "it"}
            </span>
          </div>
        )}

        {entries.map((entry, i) => (
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

            <MaskedSecretField
              entry={entry}
              onInput={(value) => touch(i, value)}
              onUndo={() => update(i, undoSecretEntry(entry))}
              onClear={() => update(i, clearSecretEntry(entry))}
            />

            <div className="text-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <span className="font-mono">{entry.filePath}</span>
              {entry.services.length > 0 && (
                <span>Used by {entry.services.join(", ")}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <MutationNotice mutation={saveMutation} errorFallback="Save failed" />

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
