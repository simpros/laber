import type { Page } from "@playwright/test";

/**
 * Wait for the SPA to finish its initial load.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
}
