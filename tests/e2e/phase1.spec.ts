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

  await expect(page.getByRole("heading", { name: "Add audio and lyrics" })).toBeVisible();
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
    "base-english-q5_1",
  ]);
});

test("desktop shell matches its visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const appWindow = page.locator(".app-window");
  const titleBar = page.locator(".title-bar").first();
  const workspace = page.locator(".workspace");

  await expect(appWindow).toBeVisible();
  await expect(workspace).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rectFor = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`${selector} not found`);
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    };

    return {
      shell: rectFor(".desktop-shell"),
      appWindow: rectFor(".app-window"),
      titleBarBackground: getComputedStyle(document.querySelector(".title-bar")!).backgroundImage,
      workspace: rectFor(".workspace"),
      workspaceMain: rectFor(".workspace-main"),
      workspaceSidebar: rectFor(".workspace-sidebar"),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.shell.width).toBe(1280);
  expect(metrics.appWindow.width).toBeLessThanOrEqual(1184);
  expect(metrics.appWindow.height).toBeGreaterThan(760);
  expect(metrics.workspace.height).toBeGreaterThan(560);
  expect(metrics.workspaceMain.right).toBeLessThan(metrics.workspaceSidebar.left);
  expect(metrics.workspaceMain.width).toBeGreaterThan(metrics.workspaceSidebar.width);
  expect(metrics.titleBarBackground).toContain("rgb(0, 0, 128)");

  await expect(titleBar).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(workspace).toHaveCSS("background-color", "rgb(239, 239, 239)");
});

test("narrow shell stacks without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".app-window")).toBeVisible();
  await expect(page.locator(".workspace")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rectFor = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`${selector} not found`);
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    };
    const stageButtons = [...document.querySelectorAll(".stage-navigation li button")].map(
      (button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width };
      },
    );

    return {
      appWindow: rectFor(".app-window"),
      workspaceMain: rectFor(".workspace-main"),
      workspaceSidebar: rectFor(".workspace-sidebar"),
      stageButtons,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.appWindow.width).toBe(390);
  expect(metrics.workspaceMain.width).toBe(metrics.workspaceSidebar.width);
  expect(metrics.workspaceMain.top).toBeLessThan(metrics.workspaceSidebar.top);
  expect(metrics.stageButtons[0]?.top).toBe(metrics.stageButtons[1]?.top);
  expect(metrics.stageButtons[0]?.left).toBeLessThan(metrics.stageButtons[1]?.left ?? 0);
  expect(metrics.stageButtons[2]?.top).toBeGreaterThan(metrics.stageButtons[0]?.top ?? 0);
});
