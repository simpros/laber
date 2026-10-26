import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// The Bun pin lives in package.json; every other mention must match it.
const rootManifest = (await Bun.file(
  join(ROOT, "package.json")
).json()) as { packageManager?: unknown };
const pin =
  typeof rootManifest.packageManager === "string"
    ? rootManifest.packageManager.match(/^bun@(\d+\.\d+\.\d+)$/)?.[1]
    : undefined;
if (!pin) {
  console.error("packageManager must pin bun@x.y.z in package.json");
  process.exit(1);
}

const SCANNED = [
  "README.md",
  ".github/workflows/ci.yml",
  ".github/actions/setup/action.yml",
  "apps/server/Dockerfile",
  "apps/web/Dockerfile",
];

const [major, minor] = pin.split(".");
const loose = new RegExp(`\\b${major}\\.${minor}\\.\\d+\\b`, "g");

let total = 0;
const mismatches: string[] = [];
for (const file of SCANNED) {
  const text = await Bun.file(join(ROOT, file)).text();
  for (const hit of text.match(loose) ?? []) {
    total += 1;
    if (hit !== pin) mismatches.push(`${file}: ${hit}`);
  }
}

if (mismatches.length > 0) {
  console.error(
    `Bun version skew (packageManager pins ${pin}):\n${mismatches.join("\n")}`
  );
  process.exit(1);
}

if (total === 0) {
  console.error(
    "No pinned Bun version found; update SCANNED in check-toolchain-version.ts"
  );
  process.exit(1);
}

console.log(`All ${total} Bun version mentions match ${pin}.`);
