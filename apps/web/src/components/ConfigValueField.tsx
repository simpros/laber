import { Icon } from "@laber/ui";
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
  keepPlaceholder = "Leave empty to keep the current value…",
  editPlaceholder = "Enter secret value…",
}: {
  id?: string;
  name?: string;
  entry: MaskedSecretState;
  inputClassName?: string;
  onInput: (value: string) => void;
  onUndo?: () => void;
  onClear?: () => void;
} & (
  | {
      isSecret: true;
      keepPlaceholder?: string;
      editPlaceholder?: string;
      placeholder?: never;
    }
  | {
      isSecret: false;
      placeholder?: string;
      keepPlaceholder?: never;
      editPlaceholder?: never;
    }
)) {
  const keep = isSecret && entry.hadValue && !entry.dirty;

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={name}
        type={isSecret ? "password" : "text"}
        value={entry.value}
        onChange={(e) => onInput(e.target.value)}
        placeholder={
          keep ? keepPlaceholder : isSecret ? editPlaceholder : placeholder
        }
        className={inputClassName}
      />
      <FieldActions
        entry={entry}
        onUndo={onUndo}
        onClear={isSecret ? onClear : undefined}
      />
    </div>
  );
}

function FieldActions({
  entry,
  onUndo,
  onClear,
}: {
  entry: MaskedSecretState;
  onUndo?: () => void;
  onClear?: () => void;
}) {
  if (entry.dirty && onUndo) {
    return (
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
    );
  }
  if (entry.hadValue && onClear) {
    return (
      <button
        type="button"
        onClick={onClear}
        className="text-text-muted hover:text-danger shrink-0 p-1 text-xs transition-colors"
        title="Clear stored value"
      >
        Clear
      </button>
    );
  }
  return null;
}

export default ConfigValueField;
