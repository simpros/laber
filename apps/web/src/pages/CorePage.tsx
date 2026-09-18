import { useMemo } from "react";
import { Card, CardHeader, Button } from "@laber/ui";
import { statusColor } from "@/lib/utils";
import {
  CORE_KEYS,
  CORE_KEY_GROUPS,
  type CoreKey,
  type CoreKeyGroup,
} from "@/lib/core-keys";
import {
  clearSecretEntry,
  markMixedSaved,
  maskedFromServer,
  undoPlainEntry,
  undoSecretEntry,
  valueForSave,
  type MaskedSecretState,
} from "@/lib/masked-secret";
import { useMaskedListEditor } from "@/lib/use-masked-list-editor";
import {
  CORE_DEPLOY_ACTION,
  CORE_STATUS_ACTIONS,
  coreConfigSave,
  useCore,
  useCoreAction,
  type CoreAction,
} from "@/lib/queries/core";
import SecretBadge from "@/components/SecretBadge";
import MutationNotice from "@/components/MutationNotice";
import QueryStatus from "@/components/QueryStatus";
import LifecycleToolbar from "@/components/LifecycleToolbar";
import ConfigValueField from "@/components/ConfigValueField";

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

// Init policy lives in `maskedFromServer` — this only attaches the key.
function fieldStatesFor(config: CoreData["config"]): FieldState[] {
  return CORE_KEYS.map((keyDef) => {
    const stored = config[keyDef.key];
    return {
      ...maskedFromServer({
        isSecret: keyDef.secret,
        value: stored?.value,
        hasValue: stored?.hasValue,
      }),
      key: keyDef.key,
      isSecret: keyDef.secret,
    };
  });
}

// Module-level so `useMaskedEntries` sync identity never thrashes.
function coreKeyOf(e: Pick<FieldState, "key">): string {
  return e.key;
}

/**
 * Mounted only once `QueryStatus` has the snapshot (parent renders it inside
 * the render-prop with `key="core"`), so fields init from props directly —
 * no init effect, no empty first paint. Save orchestration (payload,
 * mutation, optimistic fold) lives in the shared list hook; the server echo
 * converges non-dirty rows underneath — a background refetch never clobbers
 * in-progress edits.
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
    touch,
    update,
    saveMutation,
    handleSave,
  } = useMaskedListEditor<FieldState, Partial<Record<CoreKey, string | null>>>({
    init: () => fieldStatesFor(snapshot.config),
    syncValues: serverValues,
    keyOf: coreKeyOf,
    // `valueForSave` keys off `hadValue`/`dirty` — untouched secrets send
    // null (keep) — and never looks at secrecy, so secrets and plains save
    // through one path with no branch.
    toPayload: (rows) => {
      const values: Partial<Record<CoreKey, string | null>> = {};
      for (const f of rows) {
        values[f.key] = valueForSave(f);
      }
      return values;
    },
    save: coreConfigSave(),
    // One fold for secrets and plains — the keep/reset decision lives in
    // `markMixedSaved`, not here.
    fold: markMixedSaved,
  });

  // Index-addressed like Env/Secrets: one list model, no parallel by-key
  // `updateField` — the grouped render resolves indices once per render.
  const indexByKey = useMemo(
    () => new Map(fields.map((f, i) => [f.key, i] as const)),
    [fields],
  );

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
                const i = indexByKey.get(keyDef.key);
                if (i === undefined) return null;
                const field = fields[i];
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
                      <ConfigValueField
                        id={keyDef.key}
                        name={keyDef.key}
                        isSecret={field.isSecret}
                        entry={field}
                        placeholder={keyDef.placeholder}
                        onInput={(value) => touch(i, value)}
                        onUndo={() =>
                          update(
                            i,
                            field.isSecret
                              ? undoSecretEntry(field)
                              : undoPlainEntry(
                                  field,
                                  snapshot.config[keyDef.key]?.value ?? "",
                                ),
                          )
                        }
                        onClear={
                          field.isSecret
                            ? () => update(i, clearSecretEntry(field))
                            : undefined
                        }
                      />
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

  const actionMutation = useCoreAction();

  const pendingAction = actionMutation.pendingAction;

  function handleAction(action: CoreAction) {
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
            linkActivity
          />

          {data.coreServices.length > 0 && (
            <Card>
              <CardHeader
                title="Status"
                actions={
                  <LifecycleToolbar
                    actions={CORE_STATUS_ACTIONS}
                    pendingAction={pendingAction}
                    isPending={actionMutation.isPending}
                    onAction={handleAction}
                  />
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

          {/* Deploy renders through the same toolbar path (catalog-owned
           * copy), even though layout keeps it at the bottom. */}
          <div className="-mt-4 flex justify-end">
            <LifecycleToolbar
              actions={[CORE_DEPLOY_ACTION]}
              pendingAction={pendingAction}
              isPending={actionMutation.isPending}
              disabled={!data.isConfigured}
              onAction={handleAction}
              size="md"
            />
          </div>
        </div>
      )}
    </QueryStatus>
  );
}
