const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidName(s: string): boolean {
  return s.length <= 64 && NAME_RE.test(s);
}

const IMAGE_EXT_RE = /\.(?:gif|png|jpe?g|webp)$/i;

/**
 * Suggest a clean name from a file name: drop a known image extension, fold
 * accents, lowercase, collapse everything that isn't a-z or 0-9 into single
 * hyphens, trim hyphens, and cap at 64 characters (again without a trailing hyphen).
 */
export function slugify(input: string): string {
  return input
    .replace(IMAGE_EXT_RE, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}
