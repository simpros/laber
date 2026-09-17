import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Card, CardHeader, Button, Alert } from "@laber/ui";
import { api, unwrap } from "@/lib/api";
import { statusColor } from "@/lib/utils";
import {
  CORE_KEYS,
  CORE_KEY_GROUPS,
  type CoreKeyGroup,
} from "@/lib/core-keys";

export function useCore() {
  return useQuery({
    queryKey: ["core"],
    queryFn: async () => unwrap(await api.api.core.get()),
  });
}

type FieldState = {
  key: string;
  secret: boolean;
  hadValue: boolean;
  value: string;
  dirty: boolean;
};

export default function CorePage() {
  const { data, isLoading, isError, error } = useCore();
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState("");
  const [result, setResult] = useState<{
    success?: boolean;
    output?: string;
    message?: string;
  } | null>(null);
  const [fields, setFields] = useState<FieldState[]>([]);
  const [fieldsInitFor, setFieldsInitFor] = useState("");

  const groups = Object.entries(CORE_KEY_GROUPS).map(([id, meta]) => ({
    id: id as CoreKeyGroup,
    ...meta,
    keys: CORE_KEYS.filter((k) => k.group === id),
  }));

  useEffect(() => {
    if (!data) return;
    const fingerprint = JSON.stringify(data.config);
    if (fingerprint === fieldsInitFor) return;
    setFieldsInitFor(fingerprint);
    setFields(
      CORE_KEYS.map((keyDef) => {
        const stored = data.config[keyDef.key];
        return {
          key: keyDef.key,
          secret: keyDef.secret,
          hadValue: stored?.hasValue ?? false,
          value: keyDef.secret ? "" : (stored?.value ?? ""),
          dirty: false,
        };
      })
    );
  }, [data, fieldsInitFor]);

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, string | null>) => {
      const res = await api.api.core.config.put(values as never);
      return unwrap(res);
    },
    onSuccess: (res) => {
      setResult(res as { success?: boolean; message?: string });
      queryClient.invalidateQueries({ queryKey: ["core"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => {
      setResult({
        success: false,
        output: e instanceof Error ? e.message : "Unknown error",
      });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "deploy" | "stop" | "restart") => {
      if (action === "deploy")
        return unwrap(await api.api.core.deploy.post());
      if (action === "stop") return unwrap(await api.api.core.stop.post());
      return unwrap(await api.api.core.restart.post());
    },
    onSuccess: (res) => {
      setResult(res as { success?: boolean; output?: string });
      queryClient.invalidateQueries({ queryKey: ["core"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => {
      setResult({
        success: false,
        output: e instanceof Error ? e.message : "Unknown error",
      });
    },
    onSettled: () => setActionLoading(""),
  });

  const form = useForm({
    defaultValues: {} as Record<string, never>,
    onSubmit: async () => {
      const values: Record<string, string | null> = {};
      for (const f of fields) {
        values[f.key] = f.secret && !f.dirty ? null : f.value;
      }
      setResult(null);
      await saveMutation.mutateAsync(values);
    },
  });

  function fieldFor(key: string): FieldState | undefined {
    return fields.find((f) => f.key === key);
  }

  function updateField(key: string, patch: Partial<FieldState>) {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, ...patch } : f))
    );
  }

  function handleAction(action: "deploy" | "stop" | "restart") {
    setActionLoading(action);
    setResult(null);
    actionMutation.mutate(action);
  }

  if (isLoading)
    return <p className="text-text-muted text-sm">Loading…</p>;
  if (isError || !data)
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : "Failed to load core"}
      </p>
    );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Core Services</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Traefik reverse proxy with optional Cloudflare tunnel and DNS
          companion
        </p>
      </div>

      {result?.output && (
        <Alert variant={result?.success ? "success" : "error"} mono>
          {result.output}
        </Alert>
      )}
      {result?.message && (
        <Alert variant="success">{result.message}</Alert>
      )}
      {saveMutation.isError && !result && (
        <Alert variant="error">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Save failed"}
        </Alert>
      )}

      {data.coreServices.length > 0 && (
        <Card>
          <CardHeader
            title="Status"
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionLoading !== ""}
                  onClick={() => handleAction("restart")}
                >
                  {actionLoading === "restart" ? "..." : "Restart"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={actionLoading !== ""}
                  onClick={() => handleAction("stop")}
                >
                  {actionLoading === "stop" ? "..." : "Stop"}
                </Button>
              </>
            }
          />
          <div className="divide-border divide-y">
            {data.coreServices.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="font-mono text-sm">{svc.name}</p>
                  <p className="text-text-muted font-mono text-xs">
                    {svc.image}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium ${statusColor(svc.state)}`}
                >
                  {svc.state}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <div className="space-y-6">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardHeader
                title={group.label}
                subtitle={
                  group.optional ? (
                    <span className="text-text-muted text-xs font-normal">
                      Optional
                    </span>
                  ) : undefined
                }
              />
              <div className="space-y-4 p-5">
                {group.keys.map((keyDef) => {
                  const field = fieldFor(keyDef.key);
                  return (
                    <div
                      key={keyDef.key}
                      className="grid grid-cols-3 items-center gap-4"
                    >
                      <label
                        htmlFor={keyDef.key}
                        className="text-text-secondary text-sm font-medium"
                      >
                        {keyDef.label}
                        {keyDef.secret &&
                        field?.hadValue &&
                        !field.dirty ? (
                          <span className="bg-success/15 text-success ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            set
                          </span>
                        ) : keyDef.secret &&
                          field?.dirty &&
                          field.value === "" ? (
                          <span className="bg-warning/15 text-warning ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            will clear
                          </span>
                        ) : keyDef.secret && field?.dirty ? (
                          <span className="bg-success/15 text-success ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            modified
                          </span>
                        ) : keyDef.secret && !field?.hadValue ? (
                          <span className="bg-warning/15 text-warning ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            unset
                          </span>
                        ) : null}
                      </label>
                      <div className="col-span-2">
                        <div className="flex items-center gap-2">
                          <input
                            id={keyDef.key}
                            name={keyDef.key}
                            type={keyDef.secret ? "password" : "text"}
                            value={field?.value ?? ""}
                            onChange={(e) =>
                              field &&
                              updateField(keyDef.key, {
                                value: e.target.value,
                                dirty: true,
                              })
                            }
                            placeholder={
                              keyDef.secret &&
                              field?.hadValue &&
                              !field.dirty
                                ? "Leave empty to keep the current value…"
                                : keyDef.placeholder
                            }
                            className="w-full font-mono text-sm"
                          />
                          {field?.dirty ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateField(keyDef.key, {
                                  value: field.secret
                                    ? ""
                                    : (data.config[keyDef.key]?.value ??
                                      ""),
                                  dirty: false,
                                })
                              }
                              className="text-text-muted hover:text-danger shrink-0 p-1 transition-colors"
                              aria-label="Undo changes"
                              title="Undo changes"
                            >
                              Undo
                            </button>
                          ) : keyDef.secret && field?.hadValue ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateField(keyDef.key, {
                                  value: "",
                                  dirty: true,
                                })
                              }
                              className="text-text-muted hover:text-danger shrink-0 p-1 text-xs transition-colors"
                              title="Clear stored value"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            type="submit"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </form>

      <div className="-mt-4 flex justify-end">
        <Button
          variant="primary"
          disabled={actionLoading !== "" || !data.isConfigured}
          onClick={() => handleAction("deploy")}
        >
          {actionLoading === "deploy"
            ? "Deploying..."
            : "Deploy Core Stack"}
        </Button>
      </div>
    </div>
  );
}
