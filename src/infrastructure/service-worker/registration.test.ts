import { describe, expect, it, vi } from "vitest";
import {
  registerAppShellServiceWorker,
  serviceWorkerScope,
  serviceWorkerUrl,
} from "./registration";

describe("service worker registration", () => {
  it("derives registration URLs from the configured base path", () => {
    expect(serviceWorkerUrl()).toBe("/sw.js");
    expect(serviceWorkerScope()).toBe("/");
  });

  it("reports unsupported browsers without throwing", async () => {
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: undefined,
    });

    await expect(registerAppShellServiceWorker()).resolves.toEqual({
      supported: false,
      registered: false,
    });

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: original,
    });
  });

  it("registers with updateViaCache disabled when supported", async () => {
    const update = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ scope: "http://localhost/", update });
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    await expect(registerAppShellServiceWorker()).resolves.toMatchObject({
      supported: true,
      registered: true,
      scope: "http://localhost/",
    });
    expect(register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(update).toHaveBeenCalledTimes(1);

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: original,
    });
  });
});
