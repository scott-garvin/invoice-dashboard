import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:8082" });
test.skip(
  !process.env.TEST_DATABASE_URL,
  "Requires a disposable Postgres test database.",
);
test("live graph survives reload and clarification before approved draft creation", async ({
  page,
}) => {
  async function connect() {
    await page
      .getByRole("button", { name: "Demo access", exact: true })
      .click();
    await page
      .getByLabel("Ledgerly demo access key")
      .fill("public-local-e2e-test-key-only");
    await page.getByRole("button", { name: "Connect live workspace" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.goto("/");
  await connect();
  await page
    .getByRole("button", { name: "Explore AI intake", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Extract with AI", exact: true })
    .click();
  await expect(
    page.getByText(
      "Set a due date. Payment terms were missing or unsupported.",
    ),
  ).toBeVisible();
  await page.reload();
  await connect();
  await page
    .getByRole("button", { name: "Explore AI intake", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Autumn campaign.*Needs details/ })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Complete missing details" }).click();
  await page.getByLabel("Due date").fill("2026-12-01");
  await page.getByRole("button", { name: "Continue to approval" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Autumn campaign.*Awaiting approval/ }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review invoice draft" }).click();
  await expect(page.getByLabel("Due date")).toHaveValue("2026-12-01");
  await page.getByRole("button", { name: "Approve and save draft" }).click();
  await expect(
    page.getByText("This intake's draft is saved.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: /Autumn campaign.*Draft saved/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Review invoice draft" }),
  ).toHaveCount(0);
});
