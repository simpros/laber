import { runMigrations } from "@laber/db";
import { configureLogging, getLogger } from "@laber/logging";
import { app } from "./app";

await configureLogging();
const logger = getLogger(["laber", "server"]);

try {
  runMigrations();
} catch (err) {
  logger.error("Failed to run database migrations", {
    error: String(err),
  });
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3001);

app.listen(port);

logger.info(`laber API listening on http://localhost:${port}`);
