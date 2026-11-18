/**
 * Admin requests never follow redirects: an expired Cloudflare Access session
 * answers with a redirect to the Access login, which fetch can't follow cross-origin.
 */
export function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, redirect: "manual" });
}

/** True for a 401/403 or an Access login redirect. */
export function signInRequired(res: Response): boolean {
  return res.type === "opaqueredirect" || res.status === 401 || res.status === 403;
}
