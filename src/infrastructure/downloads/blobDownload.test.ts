import { describe, expect, it, vi } from "vitest";
import { downloadText, sanitizeDownloadName } from "./blobDownload";

describe("blob downloads", () => {
  it("sanitizes file names and rejects path injection", () => {
    expect(sanitizeDownloadName("../Unsafe Project?.lrc")).toBe("Unsafe-Project.lrc");
    expect(sanitizeDownloadName("..\\..\\")).toBe("bolt95-export.txt");
  });

  it("creates and revokes object URLs for text downloads", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.useFakeTimers();

    expect(downloadText("hello", "text/plain; charset=utf-8", "../hello.vtt")).toBe("hello.vtt");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");

    vi.useRealTimers();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });
});
