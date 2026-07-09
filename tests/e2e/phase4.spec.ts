import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => resolve(import.meta.dirname, `../../src/test/fixtures/${name}`);

test("downloads models only after explicit action and rejects corrupt bytes before inference", async ({
  page,
}) => {
  const modelRequests: string[] = [];
  const privateRequests: string[] = [];
  await page.route("**/models/ggml-base.en-q5_1.bin", async (route) => {
    modelRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: "not a real model",
    });
  });
  page.on("request", (request) => {
    if (/short-valid|timed\.lrc|lyrics|transcript|\.mp3/iu.test(request.url())) {
      privateRequests.push(request.url());
    }
  });

  await page.goto(".");
  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await expect(page.getByRole("button", { name: "Continue to transcription" })).toBeEnabled();
  expect(modelRequests).toEqual([]);

  await page.getByRole("button", { name: "Continue to transcription" }).click();
  await expect(page.getByRole("heading", { name: "Local Whisper transcription" })).toBeVisible();
  await expect(page.getByText(/0 models/u)).toBeVisible();
  await page.getByRole("button", { name: "Download model" }).click();
  await expect(page.getByRole("alert")).toContainText("Model file size does not match");
  await expect(page.getByRole("alert")).toContainText("INPUT_INVALID");
  await expect(page.getByRole("button", { name: "Transcribe locally" })).toBeDisabled();

  expect(modelRequests).toHaveLength(1);
  expect(modelRequests[0]).toContain("/models/ggml-base.en-q5_1.bin");
  expect(privateRequests).toEqual([]);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
