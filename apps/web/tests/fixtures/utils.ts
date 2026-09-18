import type { Page } from "@playwright/test";

export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
}
