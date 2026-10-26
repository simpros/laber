import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// The Bun pin lives in packageManager. Dockerfiles take it as a build arg
// (no literal), README states it for humans; every other mention is a skew
// risk, so CI-only files must not carry a version at all.
export function readPin(manifest: unknown): string {
  const packageManager =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { packageManager?: unknown }).packageManager
      : undefined;
  const pin =
    typeof packageManager === "string"
      ? packageManager.match(/^bun@(\d+\.\d+\.\d+)$/)?.[1]
      : undefined;
  if (!pin) throw new Error("packageManager must pin bun@x.y.z");
  return pin;
}

export interface VersionFinding {
  file: string;
  detail: string;
}

const README_PATTERN = /Requirements: Bun (\d+\.\d+\.\d+)/;
const DOCKER_ARG_PATTERN = /^ARG BUN_VERSION\s*$/m;
const DOCKER_FROM_LITERAL = /FROM oven\/bun:\d+\.\d+\.\d+-/;
const CI_PIN_PATTERN = /bun-version:\s*["']?\d/;

export function checkBunVersions(
  files: Record<string, string>,
  pin: string
): VersionFinding[] {
  const findings: VersionFinding[] = [];
  const readme = files["README.md"];
  if (readme === undefined) {
    findings.push({ file: "README.md", detail: "file not checked" });
  } else {
    const stated = readme.match(README_PATTERN)?.[1];
    if (!stated) {
      findings.push({
        file: "README.md",
        detail: "no 'Requirements: Bun x.y.z' line; update the guard",
      });
    } else if (stated !== pin) {
      findings.push({
        file: "README.md",
        detail: `states ${stated}, packageManager pins ${pin}`,
      });
    }
  }
  for (const file of ["apps/server/Dockerfile", "apps/web/Dockerfile"]) {
    const text = files[file];
    if (text === undefined) {
      findings.push({ file, detail: "file not checked" });
      continue;
    }
    if (!DOCKER_ARG_PATTERN.test(text)) {
      findings.push({ file, detail: "missing 'ARG BUN_VERSION'" });
    }
    const literal = text.match(DOCKER_FROM_LITERAL)?.[0];
    if (literal) {
      findings.push({ file, detail: `hardcoded base image '${literal}'` });
    }
  }
  for (const file of [
    ".github/workflows/ci.yml",
    ".github/actions/setup/action.yml",
  ]) {
    const text = files[file];
    if (text === undefined) {
      findings.push({ file, detail: "file not checked" });
      continue;
    }
    if (CI_PIN_PATTERN.test(text)) {
      findings.push({ file, detail: "hardcoded bun-version pin" });
    }
  }
  return findings;
}

const CHECKED = [
  "README.md",
  "apps/server/Dockerfile",
  "apps/web/Dockerfile",
  ".github/workflows/ci.yml",
  ".github/actions/setup/action.yml",
];

const manifest = (await Bun.file(
  join(ROOT, "package.json")
).json()) as unknown;
let pin: string;
try {
  pin = readPin(manifest);
} catch {
  console.error("packageManager must pin bun@x.y.z in package.json");
  process.exit(1);
}

const files: Record<string, string> = {};
for (const file of CHECKED) {
  files[file] = await Bun.file(join(ROOT, file)).text();
}
const findings = checkBunVersions(files, pin);
if (findings.length > 0) {
  console.error(
    `Bun version skew (packageManager pins ${pin}):\n${findings
      .map((finding) => `${finding.file}: ${finding.detail}`)
      .join("\n")}`
  );
  process.exit(1);
}

console.log(`Bun versions agree on ${pin}.`);
