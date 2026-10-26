import { runMigrations } from "@laber/db";
import { errorDetails, getLogger } from "@laber/logging";
import { app } from "./app";

const logger = getLogger("server");

try {
  runMigrations();
} catch (err) {
  logger.error("Failed to run database migrations: {error}", {
    error: errorDetails(err),
  });
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3001);

app.listen(port);

logger.info(`laber API listening on http://localhost:${port}`);
