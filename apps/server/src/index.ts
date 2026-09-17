import { runMigrations } from "@laber/db";
import { app } from "./app";

try {
  runMigrations();
} catch (err) {
  console.error("Failed to run database migrations:", err);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3001);

app.listen(port);

console.log(`laber API listening on http://localhost:${port}`);
