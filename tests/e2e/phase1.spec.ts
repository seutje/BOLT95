import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto(".");
  await expect(page.getByText(/mode$/u).last()).toBeVisible();
});

test("production shell is private, keyboard operable, and accessible", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await expect(page.getByRole("heading", { name: "BOLT95 — Local Lyric Studio" })).toBeVisible();
  await expect(page.getByText("Your media stays on this device.")).toBeVisible();
  await expect(page.getByRole("button", { name: /2\. Transcribe/u })).toBeDisabled();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "File" })).toBeFocused();
  const detailsButton = page.getByRole("button", { name: "Details…" });
  await detailsButton.click();
  await expect(page.getByRole("dialog", { name: "Runtime capabilities" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Runtime capabilities" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "OK" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close Runtime capabilities" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(detailsButton).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("CSP permits the verified worker, WASM, and blob paths", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const wasm = await WebAssembly.compile(
      new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
    );
    const blob = new Blob(["self.postMessage('ready')"], {
      type: "text/javascript",
    });
    const url = URL.createObjectURL(blob);
    try {
      const workerResult = await new Promise<string>((resolve, reject) => {
        const worker = new Worker(url);
        worker.addEventListener("message", (event: MessageEvent<string>) => {
          worker.terminate();
          resolve(event.data);
        });
        worker.addEventListener("error", () => reject(new Error("Worker blocked")));
      });
      return { wasm: wasm instanceof WebAssembly.Module, workerResult };
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  expect(result).toEqual({ wasm: true, workerResult: "ready" });
});

test("all application requests stay on the static host and retain the base path", async ({
  page,
  baseURL,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.reload();
  await expect(page.getByText(/mode$/u).last()).toBeVisible();

  const expectedOrigin = new URL(baseURL ?? "http://127.0.0.1:8000").origin;
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((request) => new URL(request).origin === expectedOrigin)).toBe(true);

  if (new URL(baseURL ?? expectedOrigin).pathname.startsWith("/BOLT95/")) {
    expect(requests.every((request) => new URL(request).pathname.startsWith("/BOLT95/"))).toBe(
      true,
    );
  }
});

test("runtime model manifest is emitted below the configured base path", async ({ request }) => {
  const response = await request.get("config/models.json");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as { models: Array<{ id: string }> };
  expect(manifest.models.map((model) => model.id)).toEqual([
    "tiny-multilingual-q5_1",
    "base-multilingual-q5_1",
  ]);
});

test("desktop shell matches its visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page).toHaveScreenshot("shell-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("narrow shell stacks without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page).toHaveScreenshot("shell-narrow.png", {
    animations: "disabled",
    fullPage: true,
  });
});
