import { test as teardown } from "@playwright/test";

teardown("global teardown", async () => {
  console.log("\nE2E test teardown complete.\n");
});
