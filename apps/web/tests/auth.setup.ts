import { expect, test as setup } from "@playwright/test";
import type { Page } from "@playwright/test";
import { TEST_USER } from "./fixtures";

const authDir = "tests/.auth";

async function loginAndSaveState(
  page: Page,
  email: string,
  password: string,
  path: string,
) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  const cookies = await page.context().cookies();
  expect(cookies.length).toBeGreaterThan(0);

  await page.context().storageState({ path });
}

setup("authenticate as user", async ({ page }) => {
  await loginAndSaveState(
    page,
    TEST_USER.email,
    TEST_USER.password,
    `${authDir}/user.json`,
  );
});

setup("guest state", async ({ page }) => {
  await page.goto("/login");
  await page.context().storageState({ path: `${authDir}/guest.json` });
});
