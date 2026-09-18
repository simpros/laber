import { Button, type ButtonSize } from "@laber/ui";

export type LifecycleActionItem<TAction extends string> = {
  action: TAction;
  label: string;
  /** Busy copy while this action is the pending one. */
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
};

/**
 * One toolbar for every lifecycle button farm (Core + stack detail): a row
 * of action buttons over the existing `useLifecycleAction` shape. Pending
 * copy is per-action (`pendingAction === …`), so pages stop re-encoding the
 * `mutate` + label choreography with inconsistent busy strings.
 */
export function LifecycleToolbar<TAction extends string>({
  actions,
  pendingAction,
  isPending,
  onAction,
  size = "sm",
  disabled,
}: {
  actions: LifecycleActionItem<TAction>[];
  pendingAction: TAction | undefined;
  isPending: boolean;
  onAction: (action: TAction) => void;
  size?: ButtonSize;
  /** Extra disable reason beyond a running action (e.g. not configured). */
  disabled?: boolean;
}) {
  return (
    <>
      {actions.map((item) => (
        <Button
          key={item.action}
          variant={item.variant ?? "secondary"}
          size={size}
          disabled={disabled || isPending}
          onClick={() => onAction(item.action)}
        >
          {pendingAction === item.action ? item.pendingLabel : item.label}
        </Button>
      ))}
    </>
  );
}

export default LifecycleToolbar;
