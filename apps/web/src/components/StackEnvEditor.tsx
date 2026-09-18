import { useEffect } from "react";
import { Button, Icon } from "@laber/ui";
import {
  markMixedSaved,
  mergeServerEntries,
  setRowSecret,
  useMaskedEntries,
  valueForSave,
  type MaskedSecretState,
} from "@/lib/masked-secret";
import { useSaveStackEnv } from "@/lib/queries/stacks";
import SecretBadge from "@/components/SecretBadge";
import MutationNotice from "@/components/MutationNotice";
import { MaskedSecretField } from "@/components/MaskedSecretField";

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
  const { entries, setEntries, update, applySaved } = useMaskedEntries<Row>(
    () => envVars.map(rowFor),
  );

  // Server echo owns convergence: after save (or any refetch) a list with
  // no in-progress edits is rebuilt from props. This heals a demoted row —
  // local `""` becomes the server plaintext — instead of the save fold
  // guessing at a literal it never held. Dirty rows are never touched, and
  // key renames mark the row dirty so refetches cannot wipe or duplicate
  // them while the user is editing.
  useEffect(() => {
    setEntries((prev) =>
      prev.some((e) => e.dirty)
        ? prev
        : mergeServerEntries(
            prev,
            envVars.map(rowFor),
            (e) => e.key,
          ),
    );
  }, [envVars, setEntries]);

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
    saveMutation.reset();
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
                {entry.isSecret ? (
                  <MaskedSecretField
                    entry={entry}
                    type="password"
                    keepPlaceholder="Hidden — leave empty to keep"
                    editPlaceholder="value"
                    onInput={(value) => update(i, { value, dirty: true })}
                    onUndo={() => update(i, { value: "", dirty: false })}
                    onClear={() => update(i, { value: "", dirty: true })}
                  />
                ) : (
                  <input
                    value={entry.value}
                    onChange={(e) =>
                      update(i, {
                        value: e.target.value,
                        dirty: true,
                      })
                    }
                    placeholder="value"
                    type="text"
                    className="w-full font-mono text-xs"
                  />
                )}
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
