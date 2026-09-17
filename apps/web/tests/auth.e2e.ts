import {
  expect,
  loginAsUser,
  STORAGE_STATE_GUEST,
  STORAGE_STATE_USER,
  test,
  TEST_USER,
} from "./fixtures";

test.describe("Authentication", () => {
  test.describe("Guest", () => {
    test.use({ storageState: STORAGE_STATE_GUEST });

    test("should display login page", async ({ page }) => {
      await page.goto("/login");

      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /sign in/i })
      ).toBeVisible();
    });

    test("should redirect unauthenticated users to login", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/login/);
    });

    test("should login successfully with valid credentials", async ({
      page,
    }) => {
      await loginAsUser(page, TEST_USER.email, TEST_USER.password);
      await expect(page).not.toHaveURL(/login/);
    });
  });

  test.describe("Authenticated", () => {
    test.use({ storageState: STORAGE_STATE_USER });

    test("should stay logged in across navigation", async ({ page }) => {
      await page.goto("/stacks");
      await expect(page).toHaveURL("/stacks");

      await page.goto("/core");
      await expect(page).toHaveURL("/core");

      await expect(page).not.toHaveURL(/login/);
    });
  });
});
