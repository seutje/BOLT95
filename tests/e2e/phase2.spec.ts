import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => resolve(import.meta.dirname, `../../src/test/fixtures/${name}`);

test.beforeEach(async ({ page }) => {
  await page.goto(".");
  await expect(page.getByRole("heading", { name: "Add audio and lyrics" })).toBeVisible();
});

test("imports MP3 and Unicode LRC through keyboard-equivalent file controls", async ({ page }) => {
  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await expect(page.getByText("short-valid.mp3", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Mono · 16 kHz")).toBeVisible();
  await expect(page.getByText(/Compact waveform overview:/u)).toBeVisible();
  await expect(page.getByText("Low processing risk.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to transcription" })).toBeEnabled();

  await page.getByLabel("Load TXT/LRC…").setInputFiles(fixture("lyrics/timed.lrc"));
  await expect(page.getByLabel("Canonical lyrics")).toContainText("Café déjà vu");
  await expect(page.getByText(/LRC · 4 source lines · 2 metadata fields/u)).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("drop import works and retains no user-media network request", async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on("request", (request) => {
    if (/short-valid|lyrics|\.mp3/iu.test(request.url())) mediaRequests.push(request.url());
  });
  const bytes = [...readFileSync(fixture("audio/short-valid.mp3"))];
  const dataTransfer = await page.evaluateHandle(
    ({ fileBytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(fileBytes)], "dropped.mp3", { type: "audio/mpeg" }),
      );
      return transfer;
    },
    { fileBytes: bytes },
  );
  await page.locator(".drop-zone").dispatchEvent("drop", { dataTransfer });
  await expect(page.getByText("dropped.mp3", { exact: true }).first()).toBeVisible();
  expect(mediaRequests).toEqual([]);
});

test("warns when a decodable MP3 exceeds the recommended size", async ({ page }) => {
  const source = readFileSync(fixture("audio/short-valid.mp3"));
  const padded = Buffer.concat([source, Buffer.alloc(26 * 1024 * 1024)]);
  await page.getByLabel("Choose audio…").setInputFiles({
    name: "moderate-size.mp3",
    mimeType: "audio/mpeg",
    buffer: padded,
  });
  await expect(page.getByText("moderate-size.mp3", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Moderate processing risk.")).toBeVisible();
  await expect(page.getByText(/moderate file size/u)).toBeVisible();
});

test("corrupt and empty audio errors recover without reload", async ({ page }) => {
  const picker = page.getByLabel("Choose audio…");
  await picker.setInputFiles(fixture("audio/zero-byte.mp3"));
  await expect(page.getByRole("alert")).toContainText("selected audio file is empty");
  await expect(page.getByRole("alert")).toContainText("INPUT_INVALID");

  await picker.setInputFiles(fixture("audio/corrupt.mp3"));
  await expect(page.getByRole("alert")).toContainText("could not decode this MP3");
  await picker.setInputFiles(fixture("audio/stereo.mp3"));
  await expect(page.getByText("stereo.mp3", { exact: true }).first()).toBeVisible();
});

test("preprocessing can be cancelled and restarted", async ({ page }) => {
  const picker = page.getByLabel("Choose audio…");
  await picker.setInputFiles(fixture("audio/cancel-long.mp3"));
  const cancel = page.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(cancel).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await picker.setInputFiles(fixture("audio/short-valid.mp3"));
  await expect(page.getByText("short-valid.mp3", { exact: true }).first()).toBeVisible();
});
