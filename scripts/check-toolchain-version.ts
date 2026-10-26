import { join } from "node:path";
import {
  catalogEntry,
  checkBunVersions,
  readPin,
  type CheckedFile,
} from "./lib/bun-pin";

const ROOT = join(import.meta.dir, "..");

// Globbed so a new Dockerfile or workflow is scanned
// without being listed here.
const GLOBS = ["apps/*/Dockerfile", ".github/**/*.yml"];

const manifest = (await Bun.file(
  join(ROOT, "package.json")
).json()) as unknown;
const pin = readPin(manifest);
const files: CheckedFile[] = [];
for (const pattern of GLOBS) {
  for (const path of new Bun.Glob(pattern).scanSync(ROOT)) {
    files.push({
      path,
      text: await Bun.file(join(ROOT, path)).text(),
    });
  }
}
const findings = checkBunVersions(
  files,
  pin,
  catalogEntry(manifest, "@types/bun")
);
if (findings.length > 0) {
  console.error(
    `Bun version skew (packageManager pins ${pin}):\n${findings
      .map((finding) => `${finding.file}: ${finding.detail}`)
      .join("\n")}`
  );
  process.exit(1);
}

console.log(`Bun versions agree on ${pin}.`);
