import type { Ext, Shelf } from "../../shared/types";

const EMOJI_MAX_SIDE = 256;
const EMOJI_MAX_BYTES = 512 * 1024;

/** Small, light gifs are probably emoji; bigger gifs are probably gifs. Non-gifs can only be emoji. */
export function guessShelf(f: { ext: Ext; bytes: number; width: number; height: number }): Shelf {
  if (f.ext !== "gif") return "emoji";
  const small = f.width <= EMOJI_MAX_SIDE && f.height <= EMOJI_MAX_SIDE && f.bytes <= EMOJI_MAX_BYTES;
  return small ? "emoji" : "gifs";
}
