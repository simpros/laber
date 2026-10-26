import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const MANIFEST_DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

// apps/* are deployment roots, not dependencies, so only
// packages/* can be orphaned.
const SCANNED_PARENTS = ["packages"];

interface WorkspaceManifest {
  name?: unknown;
  workspaces?: unknown;
  laber?: { allowOrphan?: unknown };
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

interface Workspace {
  dir: string;
  name: string;
  manifest: WorkspaceManifest;
}

async function expandWorkspaces(patterns: string[]): Promise<Workspace[]> {
  const found: Workspace[] = [];
  for (const pattern of patterns) {
    if (!/^[^*?[\]{}]+\/\*$/.test(pattern))
      throw new Error(`Unsupported workspace pattern: ${pattern}`);
    for (const entry of new Bun.Glob(`${pattern}/package.json`).scanSync(
      ROOT
    )) {
      const manifest = (await Bun.file(
        join(ROOT, entry)
      ).json()) as WorkspaceManifest;
      if (typeof manifest.name === "string")
        found.push({
          dir: join(ROOT, dirname(entry)),
          name: manifest.name,
          manifest,
        });
    }
  }
  return found;
}

// Exemptions live on the exempted package's own manifest so
// the reason is visible where the decision was made.
function exemptionReason(manifest: WorkspaceManifest): string | undefined {
  const reason = manifest.laber?.allowOrphan;
  return typeof reason === "string" ? reason : undefined;
}

// Catalogs require Bun's object form of `workspaces`, where the
// globs are nested under `packages`.
function workspacePatterns(workspaces: unknown): string[] {
  const nested =
    typeof workspaces === "object" &&
    workspaces !== null &&
    "packages" in workspaces
      ? workspaces.packages
      : undefined;
  const patterns = Array.isArray(workspaces) ? workspaces : nested;
  if (!Array.isArray(patterns))
    throw new Error("package.json#workspaces must list workspace globs");
  const globs: string[] = [];
  for (const pattern of patterns) {
    if (typeof pattern !== "string")
      throw new Error("package.json#workspaces must list workspace globs");
    globs.push(pattern);
  }
  return globs;
}

const rootManifest = (await Bun.file(
  join(ROOT, "package.json")
).json()) as WorkspaceManifest;
const workspaces = await expandWorkspaces(
  workspacePatterns(rootManifest.workspaces)
);
const referenced = new Set<string>();
for (const manifest of [
  rootManifest,
  ...workspaces.map(({ manifest }) => manifest),
])
  for (const field of MANIFEST_DEPENDENCY_FIELDS) {
    const deps = manifest[field];
    if (deps && typeof deps === "object")
      for (const name of Object.keys(deps)) referenced.add(name);
  }

const candidates = workspaces.filter(({ dir }) =>
  SCANNED_PARENTS.some((parent) =>
    dir.startsWith(join(ROOT, parent) + "/")
  )
);
const orphans = candidates
  .filter(
    ({ name, manifest }) =>
      exemptionReason(manifest) === undefined && !referenced.has(name)
  )
  .map(({ name }) => name);

if (orphans.length > 0) {
  console.error(
    `Orphan workspace packages with no consumer:\n${orphans.map((name) => `- ${name}`).join("\n")}`
  );
  process.exit(1);
}

const exempt = candidates
  .filter(({ manifest }) => exemptionReason(manifest) !== undefined)
  .map(({ name }) => name);
console.log(
  `All ${candidates.length} workspace packages have a consumer.` +
    (exempt.length > 0
      ? ` (${exempt.length} exempt: ${exempt.join(", ")})`
      : "")
);
