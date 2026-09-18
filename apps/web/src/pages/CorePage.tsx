import { useMemo } from "react";
import { Card, CardHeader, Button } from "@laber/ui";
import { useActivity } from "@/lib/activity";
import { statusColor } from "@/lib/utils";
import {
  CORE_KEYS,
  CORE_KEY_GROUPS,
  type CoreKey,
  type CoreKeyGroup,
} from "@/lib/core-keys";
import {
  markMixedSaved,
  useMaskedEntries,
  valueForSave,
  type MaskedSecretState,
} from "@/lib/masked-secret";
import {
  useCore,
  useCoreAction,
  useSaveCoreConfig,
  type CoreAction,
} from "@/lib/queries/core";
import SecretBadge from "@/components/SecretBadge";
import MutationNotice from "@/components/MutationNotice";
import QueryStatus from "@/components/QueryStatus";
import { MaskedSecretField } from "@/components/MaskedSecretField";

type FieldState = MaskedSecretState & {
  key: CoreKey;
  isSecret: boolean;
};

type CoreData = NonNullable<ReturnType<typeof useCore>["data"]>;

const groups = Object.entries(CORE_KEY_GROUPS).map(([id, meta]) => ({
  id: id as CoreKeyGroup,
  ...meta,
  keys: CORE_KEYS.filter((k) => k.group === id),
}));

function fieldStatesFor(config: CoreData["config"]): FieldState[] {
  return CORE_KEYS.map((keyDef) => {
    const stored = config[keyDef.key];
    const isSecret = keyDef.secret;
    return {
      key: keyDef.key,
      isSecret,
      // `hadValue` is only meaningful for secrets (the server never echoes
      // secret values); plain rows always carry their literal value.
      hadValue: isSecret && (stored?.hasValue ?? false),
      value: isSecret ? "" : (stored?.value ?? ""),
      dirty: false,
    };
  });
}

/**
 * Mounted only once `QueryStatus` has the snapshot (parent renders it inside
 * the render-prop with `key="core"`), so fields init from props directly —
 * no init effect, no empty first paint. After init the save fold owns the
 * local snapshot, so a background refetch never clobbers in-progress edits.
 */
function CoreConfigForm({ snapshot }: { snapshot: CoreData }) {
  // Server echo owns convergence through the shared hook: a background
  // refetch rebuilds non-dirty rows, in-progress edits are never touched.
  const serverValues = useMemo(
    () => fieldStatesFor(snapshot.config),
    [snapshot.config],
  );
  const {
    entries: fields,
    setEntries: setFields,
    applySaved,
  } = useMaskedEntries<FieldState>(() => fieldStatesFor(snapshot.config), {
    values: serverValues,
    keyOf: (f) => f.key,
  });

  const saveMutation = useSaveCoreConfig({
    // The server now holds what we sent: fold it into the local snapshot
    // instead of waiting for the refetch. One fold for secrets and plains —
    // the keep/reset decision lives in `markMixedSaved`, not here.
    onSaved: () => applySaved(markMixedSaved),
  });

  const byKey = new Map(fields.map((f) => [f.key, f]));

  function updateField(key: string, patch: Partial<FieldState>) {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const values: Partial<Record<CoreKey, string | null>> = {};
    for (const f of fields) {
      // `valueForSave` keys off `hadValue`/`dirty` — untouched secrets send
      // null (keep) — and never looks at secrecy, so secrets and plains save
      // through one path with no branch.
      values[f.key] = valueForSave(f);
    }
    saveMutation.reset();
    saveMutation.mutate(values);
  }

  return (
    <form onSubmit={handleSave}>
      <div className="mb-6">
        <MutationNotice mutation={saveMutation} errorFallback="Save failed" />
      </div>
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
                const field = byKey.get(keyDef.key);
                if (!field) return null;
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
                      {field.isSecret ? <SecretBadge entry={field} /> : null}
                    </label>
                    <div className="col-span-2">
                      {field.isSecret ? (
                        <MaskedSecretField
                          id={keyDef.key}
                          name={keyDef.key}
                          entry={field}
                          onInput={(value) =>
                            updateField(keyDef.key, { value, dirty: true })
                          }
                          onUndo={() =>
                            updateField(keyDef.key, { value: "", dirty: false })
                          }
                          onClear={() =>
                            updateField(keyDef.key, { value: "", dirty: true })
                          }
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            id={keyDef.key}
                            name={keyDef.key}
                            type="text"
                            value={field.value}
                            onChange={(e) =>
                              updateField(keyDef.key, {
                                value: e.target.value,
                                dirty: true,
                              })
                            }
                            placeholder={keyDef.placeholder}
                            className="w-full font-mono text-sm"
                          />
                          {field.dirty ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateField(keyDef.key, {
                                  value:
                                    snapshot.config[keyDef.key]?.value ?? "",
                                  dirty: false,
                                })
                              }
                              className="text-text-muted hover:text-danger shrink-0 p-1 transition-colors"
                              aria-label="Undo changes"
                              title="Undo changes"
                            >
                              Undo
                            </button>
                          ) : null}
                        </div>
                      )}
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
  );
}

export default function CorePage() {
  const query = useCore();
  const { setOpen } = useActivity();

  const actionMutation = useCoreAction();

  const pendingAction = actionMutation.pendingAction;

  function handleAction(action: CoreAction) {
    actionMutation.reset();
    actionMutation.mutate(action);
  }

  return (
    <QueryStatus query={query} failedMessage="Failed to load core">
      {(data) => (
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-semibold">Core Services</h1>
            <p className="text-text-secondary mt-1 text-sm">
              Traefik reverse proxy with optional Cloudflare tunnel and DNS
              companion
            </p>
          </div>

          <MutationNotice
            mutation={actionMutation}
            errorFallback="Action failed"
            onViewActivity={() => setOpen(true)}
          />

          {data.coreServices.length > 0 && (
            <Card>
              <CardHeader
                title="Status"
                actions={
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={actionMutation.isPending}
                      onClick={() => handleAction("restart")}
                    >
                      {pendingAction === "restart" ? "..." : "Restart"}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={actionMutation.isPending}
                      onClick={() => handleAction("stop")}
                    >
                      {pendingAction === "stop" ? "..." : "Stop"}
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

          <CoreConfigForm key="core" snapshot={data} />

          <div className="-mt-4 flex justify-end">
            <Button
              variant="primary"
              disabled={actionMutation.isPending || !data.isConfigured}
              onClick={() => handleAction("deploy")}
            >
              {pendingAction === "deploy"
                ? "Deploying..."
                : "Deploy Core Stack"}
            </Button>
          </div>
        </div>
      )}
    </QueryStatus>
  );
}
