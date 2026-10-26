export interface VersionFinding {
  file: string;
  detail: string;
}

export interface CheckedFile {
  path: string;
  text: string;
}

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

export function catalogEntry(
  manifest: unknown,
  name: string
): string | undefined {
  const workspaces =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { workspaces?: unknown }).workspaces
      : undefined;
  const catalog =
    typeof workspaces === "object" &&
    workspaces !== null &&
    "catalog" in workspaces
      ? (workspaces as { catalog?: unknown }).catalog
      : undefined;
  const entry =
    typeof catalog === "object" && catalog !== null
      ? (catalog as Record<string, unknown>)[name]
      : undefined;
  return typeof entry === "string" ? entry : undefined;
}

const DOCKER_ARG_PATTERN = /^ARG BUN_VERSION\s*$/m;
const DOCKER_FROM_LITERAL = /FROM oven\/bun:\d+\.\d+\.\d+-/;
const CI_PIN_PATTERN = /bun-version:\s*["']?\d/;

export function checkBunVersions(
  files: CheckedFile[],
  pin: string,
  catalogBun: string | undefined
): VersionFinding[] {
  const findings: VersionFinding[] = [];
  for (const { path, text } of files) {
    if (path.endsWith("Dockerfile")) {
      if (!DOCKER_ARG_PATTERN.test(text)) {
        findings.push({ file: path, detail: "missing 'ARG BUN_VERSION'" });
      }
      const literal = text.match(DOCKER_FROM_LITERAL)?.[0];
      if (literal) {
        findings.push({
          file: path,
          detail: `hardcoded base image '${literal}'`,
        });
      }
    } else if (CI_PIN_PATTERN.test(text)) {
      findings.push({ file: path, detail: "hardcoded bun-version pin" });
    }
  }
  if (catalogBun === undefined) {
    findings.push({
      file: "package.json",
      detail: "no @types/bun catalog entry",
    });
  } else if (catalogBun !== pin) {
    findings.push({
      file: "package.json",
      detail: `@types/bun catalog is ${catalogBun}, pin is ${pin}`,
    });
  }
  return findings;
}
