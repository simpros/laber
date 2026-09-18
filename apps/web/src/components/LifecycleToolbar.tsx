import { Button, type ButtonSize } from "@laber/ui";
import type { LifecycleActionItem } from "@/lib/queries/actions";

/**
 * One toolbar for every lifecycle button farm; per-action pending copy so
 * pages never re-encode label choreography.
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
  /** Extra disable reason beyond a running action. */
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
