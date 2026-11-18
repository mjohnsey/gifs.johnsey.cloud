import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePoster } from "./poster";

type ToBlob = (cb: BlobCallback, type?: string, quality?: number) => void;

const calls: { type?: string; quality?: number }[] = [];

function stubCanvas(toBlob: ToBlob) {
  const real = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return real(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: BlobCallback, type?: string, quality?: number) => {
        calls.push({ type, quality });
        toBlob(cb, type, quality);
      },
    } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
}

beforeEach(() => {
  calls.length = 0;
  class FakeDecoder {
    async decode() {
      return { image: { displayWidth: 100, displayHeight: 50, close: () => {} } };
    }
    close() {}
  }
  vi.stubGlobal("ImageDecoder", FakeDecoder);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// jsdom's Blob has no stream(), which the ImageDecoder path calls.
const source = () => Object.assign(new Blob([new Uint8Array(4)], { type: "image/gif" }), { stream: () => ({}) });

describe("makePoster", () => {
  it("returns the webp when the browser can encode it", async () => {
    stubCanvas((cb, type) => cb(new Blob(["w"], { type })));
    const blob = await makePoster(source());
    expect(blob?.type).toBe("image/webp");
    expect(calls.map((c) => c.type)).toEqual(["image/webp"]);
  });

  it("falls back to jpeg at 0.8 when the webp blob type is wrong (Safari returns png)", async () => {
    stubCanvas((cb, type) => cb(new Blob(["x"], { type: type === "image/webp" ? "image/png" : type })));
    const blob = await makePoster(source());
    expect(blob?.type).toBe("image/jpeg");
    expect(calls).toEqual([
      { type: "image/webp", quality: 0.8 },
      { type: "image/jpeg", quality: 0.8 },
    ]);
  });

  it("returns null when neither format can be encoded", async () => {
    stubCanvas((cb) => cb(null));
    expect(await makePoster(source())).toBeNull();
  });
});
