import { describe, expect, it } from "vitest";
import { gifBytes, htmlNoImage, htmlOgAbsolute, htmlOgRelative, htmlTenor, htmlTwitterOnly } from "./fixtures";
import { ImportError, resolveImage } from "./resolve-url";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function stub(routes: Record<string, Handler | Response>) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return typeof route === "function" ? route(url, init) : route.clone();
  }) as typeof fetch;
  return { fetcher, calls };
}

const gif = () => new Response(gifBytes(2, 2), { headers: { "content-type": "image/gif" } });
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
}

describe("resolveImage host rules", () => {
  it.each([
    "http://127.0.0.1/x.gif",
    "http://10.0.0.5/",
    "http://[::1]/",
    "http://localhost/",
    "http://foo.localhost/",
    "http://localhost./",
    "http://169.254.169.254/",
    "file:///etc/passwd",
    "ftp://example.com/x.gif",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://0177.0.0.1/",
    "http://0.0.0.0/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://100.64.0.1/",
    "http://[::]/",
    "http://[fc00::1]/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:10.1.2.3]/",
    "http://[64:ff9b::a00:1]/",
    "http://[::7f00:1]/",
    "http://127.1/",
    "http://127.0.0.1./",
    "http://localhost../",
    "http://u:p@10.0.0.1/",
    "http://[::ffff:0:7f00:1]/",
    "http://[64:ff9b:1::a00:1]/",
  ])("rejects %s without fetching", async (url) => {
    const { fetcher, calls } = stub({});
    const err = await rejection(resolveImage(url, fetcher));
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).message).toBe("That address isn't allowed.");
    expect(calls).toEqual([]);
  });

  it("allows public IP literals and near-miss ranges", async () => {
    for (const url of ["http://8.8.8.8/a.gif", "http://172.32.0.1/a.gif", "http://100.128.0.1/a.gif"]) {
      const { fetcher } = stub({ [url]: gif() });
      await expect(resolveImage(url, fetcher)).resolves.toMatchObject({ sourceUrl: url });
    }
  });

  it("re-checks the host on every redirect hop", async () => {
    const { fetcher, calls } = stub({
      "https://ex.com/a.gif": new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    });
    const err = await rejection(resolveImage("https://ex.com/a.gif", fetcher));
    expect((err as ImportError).message).toBe("That address isn't allowed.");
    expect(calls).toEqual(["https://ex.com/a.gif"]);
  });

  it("rejects a redirect hop to a non-http scheme", async () => {
    const { fetcher } = stub({
      "https://ex.com/a.gif": new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }),
    });
    const err = await rejection(resolveImage("https://ex.com/a.gif", fetcher));
    expect((err as ImportError).message).toBe("That address isn't allowed.");
  });

  it("fails a redirect that has no Location", async () => {
    const { fetcher } = stub({ "https://ex.com/a.gif": new Response(null, { status: 302 }) });
    const err = await rejection(resolveImage("https://ex.com/a.gif", fetcher));
    expect((err as ImportError).message).toBe("Couldn't fetch that link.");
  });

  it("rejects text that is not a URL", async () => {
    const { fetcher } = stub({});
    const err = await rejection(resolveImage("not a url", fetcher));
    expect(err).toBeInstanceOf(ImportError);
  });
});

describe("resolveImage direct urls", () => {
  it("returns bytes, source url and a name from the last path segment", async () => {
    const url = "https://ex.com/media/robot-parrot.gif";
    const { fetcher } = stub({ [url]: gif() });
    const out = await resolveImage(url, fetcher);
    expect(out.sourceUrl).toBe(url);
    expect(out.suggestedName).toBe("robot-parrot");
    expect(out.bytes).toEqual(gifBytes(2, 2));
  });

  it("follows redirects and reports the final url", async () => {
    const { fetcher } = stub({
      "https://ex.com/short": new Response(null, { status: 301, headers: { location: "/media/real.gif" } }),
      "https://ex.com/media/real.gif": gif(),
    });
    const out = await resolveImage("https://ex.com/short", fetcher);
    expect(out.sourceUrl).toBe("https://ex.com/media/real.gif");
    expect(out.suggestedName).toBe("real");
  });

  it("fails on too many redirects", async () => {
    let n = 0;
    const looping = (async (input: RequestInfo | URL) => {
      n++;
      return new Response(null, { status: 302, headers: { location: `${String(input)}x` } });
    }) as typeof fetch;
    const err = await rejection(resolveImage("https://ex.com/a", looping));
    expect((err as ImportError).message).toBe("That link redirects too many times.");
    expect(n).toBe(6);
  });

  it("allows exactly five redirects", async () => {
    const routes: Record<string, Response> = {};
    for (let i = 0; i < 5; i++) {
      routes[`https://ex.com/r${i}`] = new Response(null, { status: 302, headers: { location: `/r${i + 1}` } });
    }
    routes["https://ex.com/r5"] = gif();
    const { fetcher } = stub(routes);
    await expect(resolveImage("https://ex.com/r0", fetcher)).resolves.toMatchObject({
      sourceUrl: "https://ex.com/r5",
    });
  });

  it("fails on a non-ok response", async () => {
    const { fetcher } = stub({ "https://ex.com/a.gif": new Response("no", { status: 500 }) });
    const err = await rejection(resolveImage("https://ex.com/a.gif", fetcher));
    expect((err as ImportError).message).toBe("Couldn't fetch that link.");
  });
});

describe("resolveImage html pages", () => {
  it("uses an absolute og:image", async () => {
    const { fetcher, calls } = stub({
      "https://ex.com/p": html(htmlOgAbsolute),
      "https://cdn.ex.com/pics/cat.gif": gif(),
    });
    const out = await resolveImage("https://ex.com/p", fetcher);
    expect(calls).toEqual(["https://ex.com/p", "https://cdn.ex.com/pics/cat.gif"]);
    expect(out.sourceUrl).toBe("https://cdn.ex.com/pics/cat.gif");
    expect(out.suggestedName).toBe("cat");
  });

  it("resolves a relative og:image against the page", async () => {
    const { fetcher, calls } = stub({
      "https://ex.com/a/b": html(htmlOgRelative),
      "https://ex.com/img/x.gif": gif(),
    });
    const out = await resolveImage("https://ex.com/a/b", fetcher);
    expect(calls).toEqual(["https://ex.com/a/b", "https://ex.com/img/x.gif"]);
    expect(out.sourceUrl).toBe("https://ex.com/img/x.gif");
  });

  it("resolves against the final url after a redirect", async () => {
    const { fetcher, calls } = stub({
      "https://ex.com/old": new Response(null, { status: 302, headers: { location: "https://other.com/dir/page" } }),
      "https://other.com/dir/page": html('<meta property="og:image" content="pic.gif">'),
      "https://other.com/dir/pic.gif": gif(),
    });
    await resolveImage("https://ex.com/old", fetcher);
    expect(calls[calls.length - 1]).toBe("https://other.com/dir/pic.gif");
  });

  it("falls back to twitter:image", async () => {
    const { fetcher, calls } = stub({
      "https://ex.com/p": html(htmlTwitterOnly),
      "https://cdn.ex.com/tw.png": gif(),
    });
    await resolveImage("https://ex.com/p", fetcher);
    expect(calls[1]).toBe("https://cdn.ex.com/tw.png");
  });

  it("prefers og:image over twitter:image regardless of order", async () => {
    const page =
      '<meta name="twitter:image" content="https://cdn.ex.com/tw.png">' +
      '<meta property="og:image" content="https://cdn.ex.com/og.gif">';
    const { fetcher, calls } = stub({
      "https://ex.com/p": html(page),
      "https://cdn.ex.com/og.gif": gif(),
    });
    await resolveImage("https://ex.com/p", fetcher);
    expect(calls[1]).toBe("https://cdn.ex.com/og.gif");
  });

  it("fails when the page has no image", async () => {
    const { fetcher } = stub({ "https://ex.com/p": html(htmlNoImage) });
    const err = await rejection(resolveImage("https://ex.com/p", fetcher));
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).message).toBe("Couldn't find an image on that page.");
  });

  it("fails when the og:image points at a private host", async () => {
    const { fetcher } = stub({
      "https://ex.com/p": html('<meta property="og:image" content="http://127.0.0.1/x.gif">'),
    });
    const err = await rejection(resolveImage("https://ex.com/p", fetcher));
    expect((err as ImportError).message).toBe("That address isn't allowed.");
  });

  it("does not parse html bodies over 2 MB", async () => {
    const big = `${htmlOgAbsolute}${" ".repeat(2 * 1024 * 1024)}`;
    const { fetcher } = stub({ "https://ex.com/p": html(big) });
    const err = await rejection(resolveImage("https://ex.com/p", fetcher));
    expect((err as ImportError).message).toBe("Couldn't find an image on that page.");
  });

  it("uses the og:image of a tenor page", async () => {
    const { fetcher, calls } = stub({
      "https://tenor.com/view/robot-parrot-gif-123": html(htmlTenor),
      "https://media.tenor.com/AbCdEfGhIjIAAAAC/robot-parrot.gif": gif(),
    });
    const out = await resolveImage("https://tenor.com/view/robot-parrot-gif-123", fetcher);
    expect(calls[1]).toBe("https://media.tenor.com/AbCdEfGhIjIAAAAC/robot-parrot.gif");
    expect(out.suggestedName).toBe("robot-parrot");
  });
});

describe("resolveImage giphy", () => {
  it("rewrites a page url to the i.giphy.com gif", async () => {
    const { fetcher, calls } = stub({ "https://i.giphy.com/AbC123.gif": gif() });
    const out = await resolveImage("https://giphy.com/gifs/foo-bar-AbC123", fetcher);
    expect(calls).toEqual(["https://i.giphy.com/AbC123.gif"]);
    expect(out.suggestedName).toBe("foo-bar");
    expect(out.sourceUrl).toBe("https://i.giphy.com/AbC123.gif");
  });

  it("accepts www.giphy.com and a trailing slash or query", async () => {
    const { fetcher, calls } = stub({ "https://i.giphy.com/AbC123.gif": gif() });
    await resolveImage("https://www.giphy.com/gifs/foo-bar-AbC123/?x=1", fetcher);
    expect(calls).toEqual(["https://i.giphy.com/AbC123.gif"]);
  });

  it("handles a page url that is only an id", async () => {
    const { fetcher, calls } = stub({ "https://i.giphy.com/AbC123.gif": gif() });
    const out = await resolveImage("https://giphy.com/gifs/AbC123", fetcher);
    expect(calls).toEqual(["https://i.giphy.com/AbC123.gif"]);
    expect(out.suggestedName).toBe("abc123");
  });

  it("treats media.giphy.com and i.giphy.com urls as direct", async () => {
    const media = "https://media.giphy.com/media/AbC123/giphy.gif";
    const direct = "https://i.giphy.com/AbC123.gif";
    const { fetcher, calls } = stub({ [media]: gif(), [direct]: gif() });
    const a = await resolveImage(media, fetcher);
    const b = await resolveImage(direct, fetcher);
    expect(calls).toEqual([media, direct]);
    expect(a.suggestedName).toBe("abc123");
    expect(b.suggestedName).toBe("abc123");
  });
});

describe("resolveImage accept header", () => {
  it("asks Giphy's direct url for image/gif only", async () => {
    const accepts: (string | null)[] = [];
    const { fetcher } = stub({
      "https://i.giphy.com/AbC123.gif": (_u, init) => {
        accepts.push(new Headers(init?.headers).get("accept"));
        return gif();
      },
    });
    await resolveImage("https://giphy.com/gifs/foo-bar-AbC123", fetcher);
    await resolveImage("https://i.giphy.com/AbC123.gif", fetcher);
    expect(accepts).toEqual(["image/gif", "image/gif"]);
  });

  it("prefers gif over other images, then html, elsewhere", async () => {
    const accepts: (string | null)[] = [];
    const { fetcher } = stub({
      "https://ex.com/a.gif": (_u, init) => {
        accepts.push(new Headers(init?.headers).get("accept"));
        return gif();
      },
    });
    await resolveImage("https://ex.com/a.gif", fetcher);
    expect(accepts).toEqual(["image/gif,image/*;q=0.8,text/html;q=0.7,*/*;q=0.5"]);
  });
});

describe("resolveImage timeout", () => {
  it("gives every upstream fetch an abort signal", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const { fetcher } = stub({
      "https://ex.com/p": (_u, init) => {
        signals.push(init?.signal);
        return html(htmlOgAbsolute);
      },
      "https://cdn.ex.com/pics/cat.gif": (_u, init) => {
        signals.push(init?.signal);
        return gif();
      },
    });
    await resolveImage("https://ex.com/p", fetcher);
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it("turns a timed-out fetch into a friendly ImportError", async () => {
    const fetcher = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as typeof fetch;
    const err = await rejection(resolveImage("https://ex.com/slow.gif", fetcher));
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).message).toBe("That link took too long to respond.");
  });

  it("does the same when the body stalls past the deadline", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    });
    const { fetcher } = stub({ "https://ex.com/slow.gif": () => new Response(body) });
    const err = await rejection(resolveImage("https://ex.com/slow.gif", fetcher));
    expect((err as ImportError).message).toBe("That link took too long to respond.");
  });
});

describe("resolveImage size cap", () => {
  const url = "https://ex.com/big.gif";

  it("rejects a content-length over 25 MB without reading the body", async () => {
    let pulled = false;
    const body = new ReadableStream(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const { fetcher } = stub({
      [url]: () => new Response(body, { headers: { "content-length": "26214401" } }),
    });
    const err = await rejection(resolveImage(url, fetcher));
    expect((err as ImportError).message).toBe("That file is over 25 MB.");
    expect(pulled).toBe(false);
  });

  it("aborts a streamed body that passes the cap with no content-length", async () => {
    let cancelled = false;
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++;
        controller.enqueue(chunk);
        if (sent > 60) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const { fetcher } = stub({ [url]: () => new Response(body) });
    const err = await rejection(resolveImage(url, fetcher));
    expect((err as ImportError).message).toBe("That file is over 25 MB.");
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(40);
  });

  it("accepts a body of exactly 25 MB", async () => {
    const exact = new Uint8Array(26_214_400);
    const { fetcher } = stub({ [url]: () => new Response(exact) });
    const out = await resolveImage(url, fetcher);
    expect(out.bytes.byteLength).toBe(26_214_400);
  });
});
