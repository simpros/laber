import { Icon } from "@laber/ui";
import type { MaskedSecretState } from "@/lib/masked-secret";

/**
 * One secret input for every masked field in the SPA: the password input
 * plus undo/clear chrome over `lib/masked-secret`. Core keys, stack
 * secrets, and secret env rows compose this — the keep/clear contract
 * itself stays in the pure model, and callers place `SecretBadge` wherever
 * their layout wants it.
 */
export function MaskedSecretField({
  id,
  name,
  entry,
  onInput,
  onUndo,
  onClear,
  type = "password",
  keepPlaceholder = "Leave empty to keep the current value…",
  editPlaceholder = "Enter secret value…",
}: {
  id?: string;
  name?: string;
  entry: MaskedSecretState;
  /** User typed: caller sets value + dirty. */
  onInput: (value: string) => void;
  /** Revert to the untouched snapshot. Omit to hide Undo. */
  onUndo?: () => void;
  /** Mark the stored value cleared (empty + dirty). Omit to hide Clear. */
  onClear?: () => void;
  type?: "password" | "text";
  keepPlaceholder?: string;
  editPlaceholder?: string;
}) {
  const keep = entry.hadValue && !entry.dirty;
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={name}
        type={type}
        value={entry.value}
        onChange={(e) => onInput(e.target.value)}
        placeholder={keep ? keepPlaceholder : editPlaceholder}
        className="flex-1 font-mono text-sm"
      />
      {entry.dirty && onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="text-text-muted hover:text-danger shrink-0 p-1 transition-colors"
          aria-label="Undo changes"
          title="Undo changes"
        >
          <Icon>
            <path
              d="M2.5 2v4.5h4.5M2.87 8a5.5 5.5 0 1 0 1.01-3.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Icon>
        </button>
      ) : entry.hadValue && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="text-text-muted hover:text-danger shrink-0 p-1 text-xs transition-colors"
          title="Clear stored value"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
