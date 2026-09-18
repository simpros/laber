import { useMemo } from "react";
import { Button, Icon } from "@laber/ui";
import {
  markMixedSaved,
  setRowSecret,
  useMaskedEntries,
  valueForSave,
  type MaskedSecretState,
} from "@/lib/masked-secret";
import { useSaveStackEnv } from "@/lib/queries/stacks";
import SecretBadge from "@/components/SecretBadge";
import MutationNotice from "@/components/MutationNotice";
import ConfigValueField from "@/components/ConfigValueField";

type EnvEntry = {
  key: string;
  value: string;
  isSecret: boolean;
  hasValue: boolean;
};

/**
 * One row model for both plain and secret vars: the shared masked-secret
 * state plus the row chrome. `hadValue` is only meaningful for secret rows
 * (the server never echoes secret values); plain rows always carry their
 * literal value.
 */
type Row = MaskedSecretState & {
  key: string;
  isSecret: boolean;
};

function rowFor(entry: EnvEntry): Row {
  return {
    key: entry.key,
    value: entry.isSecret ? "" : entry.value,
    isSecret: entry.isSecret,
    hadValue: entry.isSecret && entry.hasValue,
    dirty: false,
  };
}

function blankRow(key = ""): Row {
  return { key, value: "", isSecret: false, hadValue: false, dirty: true };
}

// Module-level so `useMaskedEntries` sync identity never thrashes.
function envKeyOf(e: Pick<Row, "key">): string {
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
  // Owned by stack identity: the parent remounts per stack (`key={name}`),
  // so initializing from props once is correct — no fingerprint dance.
  // Server echo owns convergence through the shared hook (heals a demoted
  // row — local `""` becomes the server plaintext — without inventing a
  // literal; dirty rows are never touched). The save fold is the optimistic
  // half of the same hook-owned policy, not a second owner.
  const serverValues = useMemo(() => envVars.map(rowFor), [envVars]);
  const { entries, setEntries, update, applySaved } = useMaskedEntries<Row>(
    () => envVars.map(rowFor),
    { values: serverValues, keyOf: envKeyOf },
  );

  const serverByKey = useMemo(
    () => new Map(serverValues.map((e) => [e.key, e])),
    [serverValues],
  );

  const missingVars = detectedEnvVars.filter(
    (name) => !entries.some((e) => e.key === name),
  );

  const saveMutation = useSaveStackEnv(stackName, {
    // One fold for secrets and plains — the keep/reset decision lives in
    // `markMixedSaved`; server echo (above) owns demote convergence.
    onSaved: () => applySaved(markMixedSaved),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // `valueForSave` keys off `hadValue`/`dirty` — "the server still holds a
    // masked value we never echoed → null (keep)" — and never looks at
    // `isSecret`, so both toggle directions save correctly with no branch.
    // The notice hides stale errors while pending, so no `reset()` ritual.
    saveMutation.mutate(
      entries.map((entry) => ({
        key: entry.key,
        value: valueForSave(entry),
        isSecret: entry.isSecret,
      })),
    );
  }

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

  return (
    <form onSubmit={handleSave} className="pb-2">
      <div className="space-y-2">
        {entries.map((entry, i) => {
          const isDetected = detectedEnvVars.includes(entry.key);
          return (
            <div key={i} className="flex items-center gap-2">
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
                  isSecret={entry.isSecret}
                  entry={entry}
                  inputClassName="w-full font-mono text-xs"
                  placeholder="value"
                  keepPlaceholder="Hidden — leave empty to keep"
                  editPlaceholder="value"
                  onInput={(value) => update(i, { value, dirty: true })}
                  onUndo={() => {
                    if (entry.isSecret) {
                      update(i, { value: "", dirty: false });
                      return;
                    }
                    const server = serverByKey.get(entry.key);
                    if (!server) {
                      // Brand-new row: nothing to restore, so undo removes
                      // it instead of inventing a literal.
                      removeEnvVar(i);
                      return;
                    }
                    update(i, {
                      value: !server.isSecret ? server.value : "",
                      dirty: false,
                    });
                  }}
                  onClear={
                    entry.isSecret
                      ? () => update(i, { value: "", dirty: true })
                      : undefined
                  }
                />
              </div>
              {isDetected && (
                <span className="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-medium">
                  detected
                </span>
              )}
              {entry.isSecret && <SecretBadge entry={entry} />}
              <label
                className="text-text-muted flex items-center gap-1 text-xs"
                title="Masks the value in the UI and hides it from API responses. The actual value is still stored and passed to Docker on deploy."
              >
                <input
                  type="checkbox"
                  checked={entry.isSecret}
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
