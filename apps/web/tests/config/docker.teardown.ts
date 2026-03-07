import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const e2eDataDir = join(__dirname, "../.data");

export default async function teardown(): Promise<void> {
  console.log("Cleaning up e2e data directory...");
  rmSync(e2eDataDir, { recursive: true, force: true });
  console.log("Cleanup complete\n");
}
