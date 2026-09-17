import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Icon } from "@laber/ui";
import { api, unwrap } from "@/lib/api";

type EnvEntry = {
  key: string;
  value: string;
  isSecret: boolean;
  hasValue: boolean;
};

export default function StackEnvEditor({
  envVars,
  stackName,
  detectedEnvVars = [],
}: {
  envVars: EnvEntry[];
  stackName: string;
  detectedEnvVars?: string[];
}) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState(() =>
    envVars.map((v) => ({
      key: v.key,
      value: v.isSecret ? "" : v.value,
      isSecret: v.isSecret,
      hadSecretValue: v.isSecret && v.hasValue,
      valueTouched: false,
    }))
  );

  const missingVars = detectedEnvVars.filter(
    (name) => !entries.some((e) => e.key === name)
  );

  const saveMutation = useMutation({
    mutationFn: async (
      payload: Array<{
        key: string;
        value: string | null;
        isSecret: boolean;
      }>
    ) => {
      const res = await api.api
        .stacks({ name: stackName })
        .env.put({ entries: payload });
      return unwrap(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stack", stackName] });
    },
  });

  const form = useForm({
    defaultValues: {} as Record<string, never>,
    onSubmit: async () => {
      await saveMutation.mutateAsync(
        entries.map((e) => ({
          key: e.key,
          value: !e.valueTouched && e.hadSecretValue ? null : e.value,
          isSecret: e.isSecret,
        }))
      );
    },
  });

  function addEnvVar() {
    setEntries((prev) => [
      ...prev,
      {
        key: "",
        value: "",
        isSecret: false,
        hadSecretValue: false,
        valueTouched: true,
      },
    ]);
  }

  function addDetectedVar(name: string) {
    setEntries((prev) => [
      ...prev,
      {
        key: name,
        value: "",
        isSecret: false,
        hadSecretValue: false,
        valueTouched: true,
      },
    ]);
  }

  function addAllMissing() {
    setEntries((prev) => [
      ...prev,
      ...missingVars.map((name) => ({
        key: name,
        value: "",
        isSecret: false,
        hadSecretValue: false,
        valueTouched: true,
      })),
    ]);
  }

  function removeEnvVar(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEntry(
    index: number,
    patch: Partial<(typeof entries)[number]>
  ) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...patch } : e))
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="space-y-2">
        {entries.map((entry, i) => {
          const isDetected = detectedEnvVars.includes(entry.key);
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                value={entry.key}
                onChange={(e) => updateEntry(i, { key: e.target.value })}
                placeholder="KEY"
                className="w-48 font-mono text-xs"
              />
              <input
                value={entry.value}
                onChange={(e) =>
                  updateEntry(i, {
                    value: e.target.value,
                    valueTouched: true,
                  })
                }
                placeholder={
                  entry.hadSecretValue && !entry.valueTouched
                    ? "Hidden — leave empty to keep"
                    : "value"
                }
                type={entry.isSecret ? "password" : "text"}
                className="flex-1 font-mono text-xs"
              />
              {isDetected && (
                <span className="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-medium">
                  detected
                </span>
              )}
              <label
                className="text-text-muted flex items-center gap-1 text-xs"
                title="Masks the value in the UI and hides it from API responses. The actual value is still stored and passed to Docker on deploy."
              >
                <input
                  type="checkbox"
                  checked={entry.isSecret}
                  onChange={(e) =>
                    updateEntry(i, { isSecret: e.target.checked })
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

      {saveMutation.isError && (
        <p className="text-danger mt-2 text-sm">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Save failed"}
        </p>
      )}

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
        <div className="bg-surface-1 border-border fixed inset-x-0 bottom-0 z-10 border-t px-4 py-3 sm:px-6 md:px-8">
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
