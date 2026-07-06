import { expect, test } from "@playwright/test";

test("Whisper proof loads in the required non-isolated baseline", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("spikes/whisper/");
  await expect(page.getByRole("heading", { name: "Single-thread Whisper proof" })).toBeVisible();
  await expect(page.locator("#isolated")).toHaveText("false");
  await expect(page.locator("#shared-array-buffer")).toHaveText("false");
  await expect(page.getByRole("button", { name: "Run 3-cycle proof" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("video proof encodes, cancels, and restarts", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("spikes/video-export/");
  await expect(page.locator("body")).toHaveAttribute("data-probes", "complete");
  const exportButton = page.getByRole("button", { name: "Export five-second WebM" });
  test.skip(await exportButton.isDisabled(), "This browser has no WebCodecs WebM path");

  await exportButton.click();
  await page.waitForTimeout(50);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-proof", "cancelled");

  await exportButton.click();
  await expect(page.locator("body")).toHaveAttribute("data-proof", "passed", {
    timeout: 60_000,
  });
  const measurement = JSON.parse(await page.locator("#result").innerText()) as {
    driftMs: number;
    submittedFrames: number;
  };
  expect(measurement.submittedFrames).toBe(150);
  expect(measurement.driftMs).toBeLessThanOrEqual(100);
  expect(errors).toEqual([]);
});

test("real Whisper model returns timed evidence", async ({ page }) => {
  test.skip(process.env.BOLT95_REAL_WHISPER !== "1", "Opt-in heavy real-model test");
  test.setTimeout(360_000);

  await page.goto("spikes/whisper/");
  await page.getByRole("button", { name: "Run 3-cycle proof" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-proof", "passed", {
    timeout: 300_000,
  });
  const result = JSON.parse(await page.locator("#result").innerText()) as {
    transcript: { segments: Array<{ tokens: Array<{ startMs: number | null }> }> };
  };
  expect(result.transcript.segments.length).toBeGreaterThan(0);
  expect(
    result.transcript.segments
      .flatMap((segment) => segment.tokens)
      .some((token) => token.startMs !== null),
  ).toBe(true);
});
