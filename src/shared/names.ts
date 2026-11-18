const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidName(s: string): boolean {
  return s.length <= 64 && NAME_RE.test(s);
}
