// Pure byte sniffing. No Workers-only APIs: the Node migration script imports this too.
import type { Ext } from "../src/shared/types";

export type SniffResult =
  | { kind: "image"; ext: Ext | "webp"; contentType: string; width: number; height: number }
  | { kind: "video" }
  | { kind: "unknown" };

const UNKNOWN: SniffResult = { kind: "unknown" };

const ascii = (b: Uint8Array, at: number, s: string) =>
  b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const u32be = (b: Uint8Array, at: number) =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

function image(ext: Ext | "webp", contentType: string, width: number, height: number): SniffResult {
  return width > 0 && height > 0 ? { kind: "image", ext, contentType, width, height } : UNKNOWN;
}

function sniffGif(b: Uint8Array): SniffResult {
  if (b.length < 10) return UNKNOWN;
  return image("gif", "image/gif", u16le(b, 6), u16le(b, 8));
}

function sniffPng(b: Uint8Array): SniffResult {
  if (b.length < 24 || !ascii(b, 12, "IHDR")) return UNKNOWN;
  return image("png", "image/png", u32be(b, 16), u32be(b, 20));
}

function sniffJpeg(b: Uint8Array): SniffResult {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return UNKNOWN;
    const marker = b[i + 1]!;
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return UNKNOWN; // end of image / start of scan before any SOF
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return UNKNOWN;
      return image("jpg", "image/jpeg", u16be(b, i + 7), u16be(b, i + 5));
    }
    i += 2 + u16be(b, i + 2);
  }
  return UNKNOWN;
}

function sniffWebp(b: Uint8Array): SniffResult {
  const make = (w: number, h: number) => image("webp", "image/webp", w, h);
  if (ascii(b, 12, "VP8 ")) {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return UNKNOWN;
    return make(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (ascii(b, 12, "VP8L")) {
    if (b.length < 25 || b[20] !== 0x2f) return UNKNOWN;
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return make((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (ascii(b, 12, "VP8X")) {
    if (b.length < 30) return UNKNOWN;
    return make(u24le(b, 24) + 1, u24le(b, 27) + 1);
  }
  return UNKNOWN;
}

/** True for a WebP whose VP8X header sets the animation flag (0x02). Simple WebP is never animated. */
export function isAnimatedWebp(b: Uint8Array): boolean {
  return ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP") && ascii(b, 12, "VP8X") && b.length > 20 && (b[20]! & 0x02) !== 0;
}

// ISO-BMFF image brands share the `ftyp` box with video; they are stills, not video.
const STILL_BRANDS = new Set(["avif", "avis", "heic", "heix", "heim", "heis", "mif1", "msf1"]);

export function sniff(bytes: Uint8Array): SniffResult {
  if (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) return sniffGif(bytes);
  if (bytes[0] === 0x89 && ascii(bytes, 1, "PNG\r\n\x1a\n")) return sniffPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return sniffJpeg(bytes);
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return sniffWebp(bytes);
  if (ascii(bytes, 4, "ftyp") && bytes.length >= 12) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    return STILL_BRANDS.has(brand) ? UNKNOWN : { kind: "video" };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: "video" };
  }
  return UNKNOWN;
}
