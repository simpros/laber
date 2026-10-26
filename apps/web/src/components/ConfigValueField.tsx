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
  isSecret: boolean;
  entry: MaskedSecretState;
  placeholder?: string;
  inputClassName?: string;
  onInput: (value: string) => void;
  onUndo?: () => void;
  onClear?: () => void;
  keepPlaceholder?: string;
  editPlaceholder?: string;
}) {
  const secret = isSecret;
  const keep = secret && entry.hadValue && !entry.dirty;

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={name}
        type={secret ? "password" : "text"}
        value={entry.value}
        onChange={(e) => onInput(e.target.value)}
        placeholder={
          secret ? (keep ? keepPlaceholder : editPlaceholder) : placeholder
        }
        className={secret ? "flex-1 font-mono text-sm" : inputClassName}
      />
      <FieldActions
        entry={entry}
        onUndo={onUndo}
        onClear={secret ? onClear : undefined}
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
