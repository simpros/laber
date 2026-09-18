import {
  secretStatus,
  type MaskedSecretState,
} from "@/lib/masked-secret";

const styles: Record<string, string> = {
  set: "bg-success/15 text-success",
  unset: "bg-warning/15 text-warning",
  modified: "bg-success/15 text-success",
  "will-clear": "bg-warning/15 text-warning",
};

const labels: Record<string, string> = {
  set: "set",
  unset: "unset",
  modified: "modified",
  "will-clear": "will clear",
};

export default function SecretBadge({ entry }: { entry: MaskedSecretState }) {
  const status = secretStatus(entry);
  return (
    <span
      className={`${styles[status]} ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium`}
    >
      {labels[status]}
    </span>
  );
}
