/** Raised with user-facing copy; the admin endpoint shows `message` as-is. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

const MAX_BYTES = 26_214_400; // 25 MB
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const NOT_ALLOWED = "That address isn't allowed.";
const NO_IMAGE = "Couldn't find an image on that page.";
const TIMEOUT = "That link took too long to respond.";
const FETCH_TIMEOUT_MS = 15_000;

const isTimeout = (e: unknown) => e instanceof Error && e.name === "TimeoutError";

export interface ResolvedImage {
  bytes: Uint8Array;
  sourceUrl: string;
  suggestedName: string;
}

// ---- SSRF guard -------------------------------------------------------
// Only IP-literal hosts and `localhost` can be checked here. Workers can't resolve
// DNS, so a public-looking name that resolves to a private address is out of scope
// (Cloudflare's own network also keeps Worker subrequests off private ranges).
// `new URL()` already normalizes decimal/hex/octal IPv4 forms (http://2130706433/)
// to dotted quads, so the checks below see canonical hosts.

function privateIPv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Expands an IPv6 literal (no brackets) into 8 groups, or null if malformed. */
function ipv6Groups(host: string): number[] | null {
  let s = host;
  const dotted = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [, a, b, c, d] = dotted.map(Number);
    s = s.slice(0, dotted.index) + ((a! << 8) | b!).toString(16) + ":" + ((c! << 8) | d!).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":").map((g) => parseInt(g, 16)));
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => 0), ...tail];
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

function hostIsBlocked(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  if (host.startsWith("[")) {
    const g = ipv6Groups(host.slice(1, -1));
    if (!g) return true; // can't parse it, so don't fetch it
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10
    if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // 64:ff9b:1::/48 (local-use NAT64)
    // IPv4-translated (::ffff:0:a.b.c.d)
    if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) {
      return privateIPv4(g[6]! >> 8, g[6]! & 0xff);
    }
    // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::/96)
    const embedsV4 =
      (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) ||
      (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0));
    return embedsV4 && privateIPv4(g[6]! >> 8, g[6]! & 0xff);
  }

  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  return v4 ? privateIPv4(Number(v4[1]), Number(v4[2])) : false;
}

function checkUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError(NOT_ALLOWED);
  if (hostIsBlocked(url.hostname)) throw new ImportError(NOT_ALLOWED);
}

// ---- fetching ---------------------------------------------------------

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Fetches `start`, following redirects by hand so every hop's host is re-checked. */
async function fetchFollowing(
  start: URL,
  fetcher: typeof fetch,
  accept: string,
): Promise<{ response: Response; finalUrl: URL }> {
  let url = start;
  for (let redirects = 0; ; redirects++) {
    checkUrl(url);
    let response: Response;
    try {
      response = await fetcher(url.toString(), {
        redirect: "manual",
        // The deadline also covers reading the body: the signal stays attached to the response.
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept, "user-agent": "stash-importer/1.0" },
      });
    } catch (e) {
      throw new ImportError(isTimeout(e) ? TIMEOUT : "Couldn't fetch that link.");
    }
    const location = response.headers.get("location");
    if (REDIRECT_STATUSES.has(response.status) && location) {
      await response.body?.cancel();
      if (redirects >= MAX_REDIRECTS) throw new ImportError("That link redirects too many times.");
      try {
        url = new URL(location, url);
      } catch {
        throw new ImportError("Couldn't fetch that link.");
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImportError("Couldn't fetch that link.");
    }
    return { response, finalUrl: url };
  }
}

/** Reads a body, returning null (and cancelling the stream) once it passes `limit`. */
async function readCapped(response: Response, limit: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch (e) {
      throw new ImportError(isTimeout(e) ? TIMEOUT : "Couldn't fetch that link.");
    }
    const { done, value } = next;
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function readImageBytes(response: Response): Promise<Uint8Array> {
  const bytes = await readCapped(response, MAX_BYTES);
  if (!bytes) throw new ImportError("That file is over 25 MB.");
  return bytes;
}

// ---- html pages -------------------------------------------------------

async function findPageImage(html: Uint8Array): Promise<string | null> {
  let og: string | null = null;
  let twitter: string | null = null;
  const rewriter = new HTMLRewriter()
    .on('meta[property="og:image"]', {
      element(el) {
        og ??= el.getAttribute("content");
      },
    })
    .on('meta[name="twitter:image"]', {
      element(el) {
        twitter ??= el.getAttribute("content");
      },
    });
  await rewriter.transform(new Response(html)).arrayBuffer();
  return (og || twitter || "").trim() || null;
}

// ---- names and giphy --------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nameFromUrl(url: URL, fallbackId?: string): string {
  const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    /* keep raw */
  }
  const slug = slugify(decoded.replace(/\.[a-z0-9]{2,5}$/i, ""));
  if (fallbackId && (slug === "giphy" || slug === "")) return slugify(fallbackId) || "image";
  return slug || "image";
}

/** Giphy page -> direct gif. Returns null when `url` isn't a Giphy page. */
function giphyPage(url: URL): { direct: URL; name: string } | null {
  if (url.hostname !== "giphy.com" && url.hostname !== "www.giphy.com") return null;
  const m = url.pathname.match(/^\/gifs\/([^/]+)\/?$/);
  if (!m) return null;
  const parts = m[1]!.split("-");
  const id = parts.pop()!;
  if (!id) return null;
  return {
    direct: new URL(`https://i.giphy.com/${id}.gif`),
    name: slugify(parts.join("-")) || slugify(id) || "image",
  };
}

function giphyId(url: URL): string | undefined {
  if (url.hostname === "media.giphy.com") return url.pathname.match(/^\/media\/([^/]+)\//)?.[1];
  return undefined;
}

// Gif first: some hosts (Giphy) serve WebP to a plain image/* request.
const ACCEPT_GIF = "image/gif";
const ACCEPT_ANY = "image/gif,image/*;q=0.8,text/html;q=0.7,*/*;q=0.5";

// ---- entry point ------------------------------------------------------

export async function resolveImage(input: string, fetcher: typeof fetch = fetch): Promise<ResolvedImage> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ImportError("That doesn't look like a link.");
  }
  checkUrl(url);

  const giphy = giphyPage(url);
  if (giphy) url = giphy.direct;

  const first = await fetchFollowing(
    url,
    fetcher,
    url.hostname === "i.giphy.com" || url.hostname === "media.giphy.com" ? ACCEPT_GIF : ACCEPT_ANY,
  );
  const type = (first.response.headers.get("content-type") ?? "").toLowerCase();

  if (!type.includes("text/html")) {
    return {
      bytes: await readImageBytes(first.response),
      sourceUrl: first.finalUrl.toString(),
      suggestedName: giphy?.name ?? nameFromUrl(first.finalUrl, giphyId(first.finalUrl)),
    };
  }

  const html = await readCapped(first.response, MAX_HTML_BYTES);
  const found = html ? await findPageImage(html) : null;
  if (!found) throw new ImportError(NO_IMAGE);

  let imageUrl: URL;
  try {
    imageUrl = new URL(found.replace(/&amp;/g, "&"), first.finalUrl);
  } catch {
    throw new ImportError(NO_IMAGE);
  }
  const image = await fetchFollowing(imageUrl, fetcher, ACCEPT_ANY);
  return {
    bytes: await readImageBytes(image.response),
    sourceUrl: image.finalUrl.toString(),
    suggestedName: nameFromUrl(image.finalUrl),
  };
}
