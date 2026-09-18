import { MaskedSecretField } from "./MaskedSecretField";
import type { MaskedSecretState } from "@/lib/masked-secret";

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
  placeholder?: string;
  inputClassName?: string;
  keepPlaceholder?: string;
  editPlaceholder?: string;
  onInput: (value: string) => void;
  onUndo?: () => void;
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
