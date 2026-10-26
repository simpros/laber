import { join } from "node:path";
import { readPin } from "./lib/bun-pin";

const ROOT = join(import.meta.dir, "..");

const manifest = (await Bun.file(
  join(ROOT, "package.json")
).json()) as unknown;

console.log(readPin(manifest));
