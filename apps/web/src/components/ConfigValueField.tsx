import { MaskedSecretField } from "./MaskedSecretField";
import type { MaskedSecretState } from "@/lib/masked-secret";

/**
 * One value field for every config row in the SPA: secret rows get the
 * shared `MaskedSecretField` (keep/clear contract from `lib/masked-secret`),
 * plain rows get the echoed literal plus an Undo that restores the server
 * value. `onUndo` is optional everywhere — brand-new rows omit it and show
 * no Undo.
 */
export function ConfigValueField({
  id,
  name,
  isSecret,
  entry,
  placeholder,
  inputClassName = "w-full font-mono text-sm",
  onInput,
  onUndo,
  onClear,
  keepPlaceholder,
  editPlaceholder,
}: {
  id?: string;
  name?: string;
  isSecret: boolean;
  entry: MaskedSecretState;
  /** Plain-input placeholder (secret placeholders stay on the shared field). */
  placeholder?: string;
  inputClassName?: string;
  /** Secret-only placeholders; plain rows use `placeholder`. */
  keepPlaceholder?: string;
  editPlaceholder?: string;
  /** User typed: caller sets value + dirty. */
  onInput: (value: string) => void;
  /** Restore the server literal (plain) / untouched snapshot (secret). */
  onUndo?: () => void;
  /** Mark the stored secret cleared. Secret rows only; omit to hide Clear. */
  onClear?: () => void;
}) {
  if (isSecret) {
    return (
      <MaskedSecretField
        id={id}
        name={name}
        entry={entry}
        onInput={onInput}
        onUndo={onUndo}
        onClear={onClear}
        {...(keepPlaceholder ? { keepPlaceholder } : {})}
        {...(editPlaceholder ? { editPlaceholder } : {})}
      />
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={name}
        type="text"
        value={entry.value}
        onChange={(e) => onInput(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {entry.dirty && onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="text-text-muted hover:text-danger shrink-0 p-1 transition-colors"
          aria-label="Undo changes"
          title="Undo changes"
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}

export default ConfigValueField;
