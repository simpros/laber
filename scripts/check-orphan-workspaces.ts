import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".svelte",
  ".ts",
  ".tsx",
]);
const SKIPPED_DIRS = new Set([
  ".svelte-kit",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
const MANIFEST_DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

// Shared packages below apps/* are deployment roots, not
// dependencies, so only packages/* can be orphaned.
const SCANNED_PARENTS = ["packages"];

// Known exceptions: consumed by packaging rather than code,
// or intentionally kept while their future is undecided.
const ALLOWLIST: Record<string, string> = {
  "@laber/logging":
    "unwired library with no importer yet; deleting it is a product call",
  "@laber/typescript-config":
    "no tsconfig extends it; still COPY'd by apps/web/Dockerfile",
};

interface Workspace {
  dir: string;
  name: string;
}

function expandWorkspaces(): Workspace[] {
  const { workspaces } = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8")
  );
  const found: Workspace[] = [];
  for (const pattern of workspaces as string[]) {
    const parent = join(ROOT, pattern.replace(/\/\*$/, ""));
    for (const entry of readdirSync(parent)) {
      const dir = join(parent, entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
        const manifest = JSON.parse(
          readFileSync(join(dir, "package.json"), "utf8")
        );
        if (typeof manifest.name === "string")
          found.push({ dir, name: manifest.name });
      } catch {
        continue;
      }
    }
  }
  return found;
}

function manifestRefers(manifestPath: string, name: string): boolean {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return false;
  }
  return MANIFEST_DEPENDENCY_FIELDS.some(
    (field) =>
      typeof manifest[field] === "object" &&
      manifest[field] !== null &&
      name in (manifest[field] as Record<string, unknown>)
  );
}

function* sourceFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) yield* sourceFiles(path);
    } else if (
      SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))
    ) {
      yield path;
    }
  }
}

function sourceRefers(dir: string, name: string): boolean {
  for (const file of sourceFiles(dir)) {
    try {
      if (readFileSync(file, "utf8").includes(name)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

const workspaces = expandWorkspaces();
const rootManifest = join(ROOT, "package.json");
const candidates = workspaces.filter(
  ({ dir, name }) =>
    !(name in ALLOWLIST) &&
    SCANNED_PARENTS.some((parent) => dir.startsWith(join(ROOT, parent)))
);
const orphans = candidates
  .filter(
    ({ dir, name }) =>
      !manifestRefers(rootManifest, name) &&
      !workspaces.some(
        (other) =>
          other.dir !== dir &&
          (manifestRefers(join(other.dir, "package.json"), name) ||
            sourceRefers(other.dir, name))
      )
  )
  .map(({ name }) => name);

if (orphans.length > 0) {
  console.error(
    `Orphan workspace packages with no consumer:\n${orphans.map((name) => `- ${name}`).join("\n")}`
  );
  process.exit(1);
}
console.log(
  `All ${candidates.length} workspace packages have a consumer.`
);
