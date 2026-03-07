import { expect, loginAsUser, test, TEST_USER } from "./fixtures";

test.describe("Authentication", () => {
  test("should display login page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i })
    ).toBeVisible();
  });

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/login/);
  });

  test("should login successfully with valid credentials", async ({
    page,
  }) => {
    await loginAsUser(page, TEST_USER.email, TEST_USER.password);
    await expect(page).not.toHaveURL(/login/);
  });

  test("should stay logged in across navigation", async ({ page }) => {
    await loginAsUser(page, TEST_USER.email, TEST_USER.password);

    await page.goto("/");
    await expect(page).not.toHaveURL(/login/);

    await page.goto("/stacks");
    await expect(page).not.toHaveURL(/login/);
  });
});
