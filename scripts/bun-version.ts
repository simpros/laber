import { join } from "node:path";
import { catalogEntry, readPin } from "./lib/bun-pin";

const ROOT = join(import.meta.dir, "..");

const manifest = (await Bun.file(
  join(ROOT, "package.json")
).json()) as unknown;

function fail(message: string): never {
  console.error(`bun-version: ${message}`);
  process.exit(1);
}

const args = Bun.argv.slice(2);
if (args.length === 0) {
  try {
    console.log(readPin(manifest));
  } catch {
    fail("packageManager must pin bun@x.y.z");
  }
} else if (args.length === 2 && args[0] === "--catalog") {
  const entry = catalogEntry(manifest, args[1]);
  if (entry === undefined) fail(`no catalog entry for ${args[1]}`);
  console.log(entry);
} else {
  fail("usage: bun-version [--catalog <name>]");
}
