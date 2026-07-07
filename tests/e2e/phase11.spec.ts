import { expect, test } from "@playwright/test";

test("phase 11 privacy, PWA, diagnostics, and local-data controls", async ({
  context,
  page,
  baseURL,
}) => {
  const unexpectedRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const base = new URL(baseURL ?? "http://127.0.0.1:8000/");
    if (url.origin !== base.origin) unexpectedRequests.push(request.url());
  });

  await page.goto(".");
  await expect(page.getByRole("heading", { name: /BOLT95/ })).toBeVisible();

  const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifest).toBeTruthy();
  expect(manifest).toContain("manifest.webmanifest");

  await page.getByRole("button", { name: /Help/i }).click();
  await expect(page.getByRole("dialog", { name: "Safe diagnostics" })).toBeVisible();
  await expect(page.getByText("Diagnostics never include lyrics")).toBeVisible();
  await page.getByRole("button", { name: "Copy diagnostics" }).click();
  await expect(page.getByText(/Diagnostics copied|Clipboard permission was denied/)).toBeVisible();

  expect(unexpectedRequests).toEqual([]);

  if (await page.evaluate(() => "serviceWorker" in navigator)) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.reload();
    await expect(page.getByRole("heading", { name: /BOLT95/ })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /BOLT95/ })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("button", { name: /Help/i }).click();
    await expect(page.getByRole("dialog", { name: "Safe diagnostics" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Clear local data" }).click();
  await expect(
    page.getByText(/Local projects, cached models, and app shell caches cleared/),
  ).toBeVisible();
});

test("phase 11 app remains usable when service workers are disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(baseURL ?? "/");
  await expect(page.getByRole("heading", { name: /BOLT95/ })).toBeVisible();
  await expect(page.getByText("Your media stays on this device.")).toBeVisible();
  await context.close();
});
