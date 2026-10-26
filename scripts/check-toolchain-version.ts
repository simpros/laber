import { join } from "node:path";
import {
  catalogEntry,
  checkBunVersions,
  readPin,
  type CheckedFile,
} from "./lib/bun-pin";

const ROOT = join(import.meta.dir, "..");

// Fixed-version files plus every workflow: a new workflow
// is scanned by virtue of the glob, not by being listed.
const CHECKED: Omit<CheckedFile, "text">[] = [
  { path: "README.md", kind: "readme" },
  { path: "apps/server/Dockerfile", kind: "dockerfile" },
  { path: "apps/web/Dockerfile", kind: "dockerfile" },
];

const manifest = (await Bun.file(
  join(ROOT, "package.json")
).json()) as unknown;
const pin = readPin(manifest);
const files: CheckedFile[] = [];
for (const { path, kind } of CHECKED) {
  files.push({
    path,
    kind,
    text: await Bun.file(join(ROOT, path)).text(),
  });
}
for (const path of new Bun.Glob(".github/**/*.yml").scanSync(ROOT)) {
  files.push({
    path,
    kind: "workflow",
    text: await Bun.file(join(ROOT, path)).text(),
  });
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
