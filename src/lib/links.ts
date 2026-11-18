/** Join the canonical origin and a public file path, e.g. "/gifs/a.gif". */
export function absoluteUrl(canonicalOrigin: string, path: string): string {
  return `${canonicalOrigin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** The Slack shortcode for an emoji name. */
export function emojiCode(name: string): string {
  return `:${name}:`;
}
