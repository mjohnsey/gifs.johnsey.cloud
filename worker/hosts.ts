export type FileShelf = "gifs" | "emoji" | "posters";

export interface FilePathParts {
  shelf: FileShelf;
  name: string;
  ext: string;
}

const EXTS: Record<FileShelf, readonly string[]> = {
  gifs: ["gif"],
  emoji: ["gif", "png", "jpg"],
  posters: ["webp"],
};

/** Splits `/<shelf>/<name>.<ext>` into parts, or null when the shape doesn't match. */
export function parseFilePath(pathname: string): FilePathParts | null {
  const m = /^\/(gifs|emoji|posters)\/([^/.]+)\.([a-z]+)$/.exec(pathname);
  if (!m) return null;
  const shelf = m[1] as FileShelf;
  if (!EXTS[shelf].includes(m[3])) return null;
  return { shelf, name: m[2], ext: m[3] };
}

/** True for paths that are files rather than pages: stays served on the old domain. */
export function isFilePath(pathname: string): boolean {
  return pathname === "/inventory.json" || parseFilePath(pathname) !== null;
}
