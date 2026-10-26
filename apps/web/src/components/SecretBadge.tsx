import {
  secretStatus,
  type MaskedSecretState,
  type SecretStatus,
} from "@/lib/masked-secret";
import { toneClass, type Tone } from "@laber/ui";

const TONE: Record<SecretStatus, Tone> = {
  set: "success",
  unset: "warning",
  modified: "success",
  "will-clear": "warning",
};

const labels: Record<SecretStatus, string> = {
  set: "set",
  unset: "unset",
  modified: "modified",
  "will-clear": "will clear",
};

export default function SecretBadge({
  entry,
}: {
  entry: MaskedSecretState;
}) {
  const status = secretStatus(entry);
  return (
    <span
      className={`${toneClass(TONE[status])} ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium`}
    >
      {labels[status]}
    </span>
  );
}
