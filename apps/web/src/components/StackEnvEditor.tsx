import { useMemo } from "react";
import { Button, Icon } from "@laber/ui";
import {
  chromeIsSecret,
  clearSecretEntry,
  markMixedSaved,
  maskedFromServer,
  setRowSecret,
  undoPlainEntry,
  undoSecretEntry,
  valueForSave,
  wireIsSecret,
  type MaskedSecretState,
  type Secrecy,
} from "@/lib/masked-secret";
import { useMaskedListEditor } from "@/lib/use-masked-list-editor";
import { stackEnvSave, type StackEnvPayload } from "@/lib/queries/stacks";
import SecretBadge from "@/components/SecretBadge";
import MutationNotice from "@/components/MutationNotice";
import ConfigValueField from "@/components/ConfigValueField";

export type EnvEntry = {
  key: string;
  value: string;
  isSecret: boolean;
  hasValue: boolean;
};

/**
 * One row model for both plain and secret vars. `id` is the stable React
 * identity across add/remove/rename; `key` is the editable variable name.
 */
export type EnvRow = MaskedSecretState & {
  id: string;
  key: string;
  secrecy: Secrecy;
};

export function rowForEnv(entry: EnvEntry): EnvRow {
  return {
    ...maskedFromServer({
      isSecret: entry.isSecret,
      value: entry.value,
      hasValue: entry.hasValue,
    }),
    id: entry.key,
    key: entry.key,
  };
}

let blankRowSeq = 0;

function blankRow(key = ""): EnvRow {
  blankRowSeq += 1;
  return {
    id: `new-${Date.now().toString(36)}-${blankRowSeq}`,
    key,
    value: "",
    secrecy: "plain",
    hadValue: false,
    dirty: true,
  };
}

// Module-level so the list-editor sync identity never thrashes.
function envKeyOf(e: Pick<EnvRow, "key">): string {
  return e.key;
}

export default function StackEnvEditor({
  envVars,
  stackName,
  detectedEnvVars = [],
}: {
  envVars: EnvEntry[];
  stackName: string;
  detectedEnvVars?: string[];
}) {
  // Parent remounts per stack (`key={name}`), so prop-init is correct.
  const serverValues = useMemo(() => envVars.map(rowForEnv), [envVars]);
  const {
    entries,
    setEntries,
    update,
    touch,
    saveMutation,
    handleSave,
  } = useMaskedListEditor<EnvRow, StackEnvPayload>({
    init: () => envVars.map(rowForEnv),
    syncValues: serverValues,
    keyOf: envKeyOf,
    // Untouched secret sends keep (`null`); pending demote flips the wire
    // to plain while the chrome stays secret.
    toPayload: (rows) =>
      rows.map((entry) => ({
        key: entry.key,
        value: valueForSave(entry),
        isSecret: wireIsSecret(entry),
      })),
    save: stackEnvSave(stackName),
    fold: markMixedSaved,
  });

  const serverByKey = useMemo(
    () => new Map(serverValues.map((e) => [e.key, e])),
    [serverValues],
  );

  const missingVars = detectedEnvVars.filter(
    (name) => !entries.some((e) => e.key === name),
  );

  function addEnvVar() {
    setEntries((prev) => [...prev, blankRow()]);
  }

  function addDetectedVar(name: string) {
    setEntries((prev) => [...prev, blankRow(name)]);
  }

  function addAllMissing() {
    setEntries((prev) => [...prev, ...missingVars.map((name) => blankRow(name))]);
  }

  function removeEnvVar(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  /** Secret-chrome rows revert (disarming demote); new rows remove themselves. */
  function undoRow(index: number) {
    const entry = entries[index];
    if (!entry) return;
    if (chromeIsSecret(entry)) {
      update(index, undoSecretEntry(entry));
      return;
    }
    const server = serverByKey.get(entry.key);
    if (!server) {
      removeEnvVar(index);
      return;
    }
    // Secrets are never echoed, so the snapshot literal is the restore target.
    update(index, undoPlainEntry(entry, server.value));
  }

  return (
    <form onSubmit={handleSave} className="pb-2">
      <div className="space-y-2">
        {entries.map((entry, i) => {
          const isDetected = detectedEnvVars.includes(entry.key);
          return (
            <div key={entry.id} className="flex items-center gap-2">
              <input
                value={entry.key}
                onChange={(e) =>
                  update(i, { key: e.target.value, dirty: true })
                }
                placeholder="KEY"
                className="w-48 font-mono text-xs"
              />
              <div className="flex-1">
                <ConfigValueField
                  isSecret={chromeIsSecret(entry)}
                  entry={entry}
                  inputClassName="w-full font-mono text-xs"
                  placeholder="value"
                  keepPlaceholder="Hidden — leave empty to keep"
                  editPlaceholder="value"
                  onInput={(value) => touch(i, value)}
                  onUndo={() => undoRow(i)}
                  onClear={
                    chromeIsSecret(entry)
                      ? () => update(i, clearSecretEntry(entry))
                      : undefined
                  }
                />
              </div>
              {isDetected && (
                <span className="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-medium">
                  detected
                </span>
              )}
              {chromeIsSecret(entry) && <SecretBadge entry={entry} />}
              <label
                className="text-text-muted flex items-center gap-1 text-xs"
                title={
                  entry.secrecy === "demote-pending"
                    ? "Demote pending — saving flips this row to plain. Re-check to cancel."
                    : "Masks the value in the UI and hides it from API responses. The actual value is still stored and passed to Docker on deploy."
                }
              >
                <input
                  type="checkbox"
                  checked={wireIsSecret(entry)}
                  onChange={(e) =>
                    update(i, setRowSecret(entry, e.target.checked))
                  }
                  className="rounded"
                />
                Secret
              </label>
              <button
                type="button"
                onClick={() => removeEnvVar(i)}
                className="text-text-muted hover:text-danger p-1 transition-colors"
                aria-label="Remove variable"
              >
                <Icon>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </Icon>
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2">
        <MutationNotice mutation={saveMutation} errorFallback="Save failed" />
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={addEnvVar}
        >
          Add Variable
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {detectedEnvVars.length > 0 && (
        <div className="bg-surface-1 border-border mt-4 rounded-xl border px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-text-secondary shrink-0 text-xs font-medium tracking-wider uppercase">
              Detected
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {detectedEnvVars.map((name) => {
                const isMissing = missingVars.includes(name);
                return isMissing ? (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addDetectedVar(name)}
                    className="border-warning/40 text-warning hover:bg-warning/10 rounded border px-2 py-0.5 font-mono text-xs transition-colors"
                  >
                    + {name}
                  </button>
                ) : (
                  <span
                    key={name}
                    className="text-success/60 bg-surface-3 rounded px-2 py-0.5 font-mono text-xs"
                  >
                    {name}
                  </span>
                );
              })}
            </div>
            {missingVars.length > 0 && (
              <div className="ml-auto shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={addAllMissing}
                >
                  Add All Missing
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
