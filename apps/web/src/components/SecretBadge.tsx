import { StatusBadge, type Tone } from "@laber/ui";
import {
  chromeIsSecret,
  secretStatus,
  type MaskedSecretState,
  type SecrecyState,
  type SecretStatus,
} from "@/lib/masked-secret";

const META: Record<SecretStatus, { tone: Tone; label: string }> = {
  set: { tone: "success", label: "set" },
  unset: { tone: "warning", label: "unset" },
  modified: { tone: "success", label: "modified" },
  "will-clear": { tone: "warning", label: "will clear" },
};

export default function SecretBadge({
  entry,
}: {
  entry: MaskedSecretState & SecrecyState;
}) {
  if (!chromeIsSecret(entry)) return null;
  const meta = META[secretStatus(entry)];
  return (
    <StatusBadge tone={meta.tone} className="ml-2 text-[10px]">
      {meta.label}
    </StatusBadge>
  );
}
