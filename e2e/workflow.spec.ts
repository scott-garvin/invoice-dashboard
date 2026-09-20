import { test, expect } from "@playwright/test";
test("invoice draft, issue, partial payment and persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New invoice", exact: true }).click();
  await page.getByLabel("Bill to").selectOption("northstar");
  await page.getByLabel("Project or invoice title").fill("Review workflow");
  await page.getByLabel("Item 1 description").fill("Workshop");
  await page.getByLabel("Item 1 quantity").fill("2");
  await page.getByLabel("Item 1 rate").fill("125.50");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "INV-1052", exact: true }).click();
  await page.getByRole("button", { name: "Issue (demo)", exact: true }).click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("100.00");
  await page.getByLabel("Reference", { exact: true }).fill("Demo deposit");
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  await expect(
    page.getByText("Demo deposit", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator(".invoice-amount strong")).toHaveText("$151.00");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Invoices/ })
    .click();
  await page.getByRole("button", { name: "INV-1052", exact: true }).click();
  await expect(page.locator(".invoice-amount strong")).toHaveText("$151.00");
});
test("guided extraction is labeled and requires review before draft creation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore AI intake", exact: true })
    .click();
  await page.getByRole("button", { name: "Explore guided extraction" }).click();
  await expect(page.getByText("Guided example · no model call")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review invoice draft" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review invoice draft" }).click();
  await expect(page.getByLabel("Item 1 rate")).toHaveValue("450.00");
  await expect(page.getByLabel("Bill to")).toHaveValue("northstar");
});
test("rejects provider keys locally and has no horizontal page overflow", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Demo access", exact: true }).click();
  await page.getByLabel("Ledgerly demo access key").fill("sk-not-a-demo-key");
  await page.getByRole("button", { name: "Connect live workspace" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "not an OpenAI",
  );
});
