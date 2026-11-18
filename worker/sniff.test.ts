import { describe, expect, it } from "vitest";
import {
  gifBytes, jpgBytes, mp4Bytes, pngBytes, webmBytes,
  webpExtendedBytes, webpLosslessBytes, webpLossyBytes,
} from "./fixtures";
import { sniff } from "./sniff";

describe("sniff", () => {
  it("reads gif size", () => {
    expect(sniff(gifBytes(320, 240))).toEqual({
      kind: "image", ext: "gif", contentType: "image/gif", width: 320, height: 240,
    });
  });

  it("reads the committed tiny.gif", () => {
    const bytes = Uint8Array.from(
      atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
      (c) => c.charCodeAt(0),
    );
    expect(sniff(bytes)).toMatchObject({ kind: "image", ext: "gif", width: 1, height: 1 });
  });

  it("reads png size", () => {
    expect(sniff(pngBytes(640, 480))).toEqual({
      kind: "image", ext: "png", contentType: "image/png", width: 640, height: 480,
    });
  });

  it("reads jpeg size by scanning to SOF and maps to jpg", () => {
    expect(sniff(jpgBytes(1024, 768))).toEqual({
      kind: "image", ext: "jpg", contentType: "image/jpeg", width: 1024, height: 768,
    });
  });

  it.each([
    ["lossy", webpLossyBytes(100, 50)],
    ["lossless", webpLosslessBytes(100, 50)],
    ["extended", webpExtendedBytes(100, 50)],
  ])("reads %s webp size", (_label, bytes) => {
    expect(sniff(bytes)).toEqual({
      kind: "image", ext: "webp", contentType: "image/webp", width: 100, height: 50,
    });
  });

  it("detects mp4 and webm as video", () => {
    expect(sniff(mp4Bytes())).toEqual({ kind: "video" });
    expect(sniff(webmBytes())).toEqual({ kind: "video" });
  });

  it("returns unknown for junk, empty and truncated input", () => {
    expect(sniff(new Uint8Array())).toEqual({ kind: "unknown" });
    expect(sniff(new TextEncoder().encode("<html></html>"))).toEqual({ kind: "unknown" });
    expect(sniff(gifBytes(5, 5).slice(0, 8))).toEqual({ kind: "unknown" });
    expect(sniff(pngBytes(5, 5).slice(0, 20))).toEqual({ kind: "unknown" });
    expect(sniff(jpgBytes(5, 5).slice(0, 30))).toEqual({ kind: "unknown" });
  });

  it("returns unknown for a zero-size image", () => {
    expect(sniff(gifBytes(0, 0))).toEqual({ kind: "unknown" });
  });
});
