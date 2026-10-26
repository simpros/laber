import { useMemo } from "react";
import { Card, CardHeader, Button } from "@laber/ui";
import type { CoreKey } from "@laber/api-client";
import { statusColor } from "@/lib/utils";
import {
  CORE_KEY_GROUPS,
  CORE_KEY_META,
  type CoreKeyGroup,
} from "@/lib/core-key-meta";
import {
  chromeIsSecret,
  clearSecretEntry,
  markMixedSaved,
  maskedFromServer,
  undoPlainEntry,
  undoSecretEntry,
  valueForSave,
  type SecrecyEntry,
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

type FieldState = SecrecyEntry & {
  key: CoreKey;
};

type CoreData = NonNullable<ReturnType<typeof useCore>["data"]>;

const META_ENTRIES = (Object.keys(CORE_KEY_META) as CoreKey[]).map(
  (key) => ({ key, ...CORE_KEY_META[key] })
);

const groups = Object.entries(CORE_KEY_GROUPS).map(([id, meta]) => ({
  id: id as CoreKeyGroup,
  ...meta,
  keys: META_ENTRIES.filter((k) => k.group === id),
}));

function fieldStatesFor(config: CoreData["config"]): FieldState[] {
  return META_ENTRIES.map(({ key }) => {
    const stored = config[key];
    return {
      ...maskedFromServer({
        isSecret: stored?.isSecret ?? false,
        value: stored?.value,
        hasValue: stored?.hasValue,
      }),
      key,
    };
  });
}

function coreKeyOf(e: Pick<FieldState, "key">): string {
  return e.key;
}

function CoreConfigForm({ snapshot }: { snapshot: CoreData }) {
  const serverValues = useMemo(
    () => fieldStatesFor(snapshot.config),
    [snapshot.config]
  );
  const {
    entries: fields,
    touchByKey,
    updateByKey,
    saveMutation,
    handleSave,
  } = useMaskedListEditor<
    FieldState,
    Partial<Record<CoreKey, string | null>>
  >({
    init: () => fieldStatesFor(snapshot.config),
    syncValues: serverValues,
    keyOf: coreKeyOf,
    toPayload: (rows) => {
      const values: Partial<Record<CoreKey, string | null>> = {};
      for (const f of rows) {
        values[f.key] = valueForSave(f);
      }
      return values;
    },
    save: coreConfigSave(),
    fold: markMixedSaved,
  });

  const byKey = useMemo(
    () => new Map(fields.map((f) => [f.key, f] as const)),
    [fields]
  );

  return (
    <form onSubmit={handleSave}>
      <div className="mb-6">
        <MutationNotice
          mutation={saveMutation}
          errorFallback="Save failed"
        />
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
                      <SecretBadge entry={field} />
                    </label>
                    <div className="col-span-2">
                      <ConfigValueField
                        id={keyDef.key}
                        name={keyDef.key}
                        entry={field}
                        placeholder={keyDef.placeholder}
                        onInput={(value) => touchByKey(keyDef.key, value)}
                        onUndo={() =>
                          updateByKey(
                            keyDef.key,
                            chromeIsSecret(field)
                              ? undoSecretEntry(field)
                              : undoPlainEntry(
                                  field,
                                  snapshot.config[keyDef.key]?.value ?? ""
                                )
                          )
                        }
                        onClear={() =>
                          updateByKey(keyDef.key, clearSecretEntry(field))
                        }
                      />
                      {keyDef.hint ? (
                        <p className="text-text-muted mt-1 text-xs">
                          {keyDef.hint}
                        </p>
                      ) : null}
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

          {/* -mt-4 cancels the parent stack spacing so the deploy toolbar sits closer. */}
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
