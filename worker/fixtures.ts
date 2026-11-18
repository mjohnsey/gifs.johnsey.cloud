// Tiny binary and HTML fixtures built in code. The workers test pool imports
// binary files as URL strings, so tests can't read fixture files as bytes.

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

export function gifBytes(w: number, h: number): Uint8Array {
  return Uint8Array.from([...ascii("GIF89a"), ...u16le(w), ...u16le(h), 0, 0, 0, 0x3b]);
}

export function pngBytes(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), ...ascii("IHDR"), ...u32be(w), ...u32be(h), 8, 6, 0, 0, 0,
    0, 0, 0, 0,
  ]);
}

/** A JPEG with an APP0 segment, a DQT segment, then SOF0 carrying the size. */
export function jpgBytes(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xdb, 0x00, 0x05, 0, 1, 2,
    0xff, 0xc0, 0x00, 0x0b, 8, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 1, 1, 0x11, 0,
    0xff, 0xd9,
  ]);
}

export function webpLossyBytes(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    ...ascii("RIFF"), 30, 0, 0, 0, ...ascii("WEBP"),
    ...ascii("VP8 "), 10, 0, 0, 0,
    0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(w), ...u16le(h),
  ]);
}

export function webpLosslessBytes(w: number, h: number): Uint8Array {
  const bits = ((h - 1) << 14) | (w - 1);
  return Uint8Array.from([
    ...ascii("RIFF"), 25, 0, 0, 0, ...ascii("WEBP"),
    ...ascii("VP8L"), 5, 0, 0, 0,
    0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff,
  ]);
}

/** VP8X flags: 0x10 is alpha, 0x02 is the animation bit. */
export function webpExtendedBytes(w: number, h: number, animated = true): Uint8Array {
  return Uint8Array.from([
    ...ascii("RIFF"), 30, 0, 0, 0, ...ascii("WEBP"),
    ...ascii("VP8X"), 10, 0, 0, 0,
    animated ? 0x12 : 0x10, 0, 0, 0, ...u24le(w - 1), ...u24le(h - 1),
  ]);
}

/** A 12-byte MP4 header: box size, "ftyp", brand. */
export function mp4Bytes(): Uint8Array {
  return Uint8Array.from([0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii("isom")]);
}

export function webmBytes(): Uint8Array {
  return Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
}

export const htmlOgAbsolute =
  '<html><head><meta property="og:image" content="https://cdn.ex.com/pics/cat.gif"></head><body></body></html>';
export const htmlOgRelative =
  '<html><head><meta property="og:image" content="/img/x.gif"></head><body></body></html>';
export const htmlTwitterOnly =
  '<html><head><meta name="twitter:image" content="https://cdn.ex.com/tw.png"></head></html>';
export const htmlNoImage =
  "<html><head><title>Nothing here</title></head><body><p>No pictures.</p></body></html>";

/**
 * Trimmed to the meta tags Tenor serves on a gif page. The only Tenor page
 * fetched while building this was a 404 for a guessed id, which carries no
 * og:image, so the og:image tag below is written in the same markup style
 * (`class="dynamic"` first, then `property`/`content`) with a made-up media id.
 */
export const htmlTenor =
  '<!DOCTYPE html><html lang="en" dir="ltr"><head><title class="dynamic">Robot Parrot GIF</title>' +
  '<meta class="dynamic" property="og:site_name" content="Tenor">' +
  '<meta class="dynamic" property="og:title" content="Robot Parrot GIF">' +
  '<meta class="dynamic" property="og:image" content="https://media.tenor.com/AbCdEfGhIjIAAAAC/robot-parrot.gif">' +
  '<meta class="dynamic" name="twitter:image" content="https://media.tenor.com/AbCdEfGhIjIAAAAe/robot-parrot.png">' +
  "</head><body></body></html>";
