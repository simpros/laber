import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// Single home for the pinned Bun version: CI, publish.yml,
// and build-web-image.sh all derive it from packageManager
// through here instead of re-parsing the manifest.
const manifest = (await Bun.file(join(ROOT, "package.json")).json()) as {
  packageManager?: unknown;
  workspaces?: unknown;
};

function fail(message: string): never {
  console.error(`bun-version: ${message}`);
  process.exit(1);
}

const args = Bun.argv.slice(2);
if (args.length === 0) {
  const pin =
    typeof manifest.packageManager === "string"
      ? manifest.packageManager
      : undefined;
  const version =
    pin?.startsWith("bun@") === true
      ? pin.slice("bun@".length)
      : undefined;
  if (!version) fail("packageManager must be a bun@x.y.z pin");
  console.log(version);
} else if (args.length === 2 && args[0] === "--catalog") {
  const workspaces = manifest.workspaces;
  const catalog =
    typeof workspaces === "object" &&
    workspaces !== null &&
    "catalog" in workspaces
      ? workspaces.catalog
      : undefined;
  const entry =
    typeof catalog === "object" && catalog !== null
      ? Object.entries(catalog).find(([key]) => key === args[1])
      : undefined;
  if (!entry || typeof entry[1] !== "string")
    fail(`no catalog entry for ${args[1]}`);
  console.log(entry[1]);
} else {
  fail("usage: bun-version [--catalog <name>]");
}
