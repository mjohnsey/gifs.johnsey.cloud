import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useItems } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useItems", () => {
  it("returns data on success", async () => {
    const body = { canonicalOrigin: "https://stash.johnsey.cloud", adminAvailable: false, items: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    const { result } = renderHook(() => useItems("gifs"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/api/items?shelf=gifs", expect.objectContaining({ signal: expect.anything() }));
  });

  it("reports an error on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const { result } = renderHook(() => useItems("emoji"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe("Couldn't load the emoji (500).");
  });

  it("ignores a stale response that resolves after the shelf changed", async () => {
    const resolvers: Record<string, (r: Response) => void> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url: string) =>
          new Promise<Response>((resolve) => {
            resolvers[url.split("=")[1]!] = resolve;
          }),
      ),
    );
    const body = (shelf: string) => ({ canonicalOrigin: "o", adminAvailable: false, items: [{ name: shelf }] });
    const { result, rerender } = renderHook(({ shelf }) => useItems(shelf), {
      initialProps: { shelf: "gifs" as "gifs" | "emoji" },
    });
    rerender({ shelf: "emoji" });
    resolvers.emoji!(new Response(JSON.stringify(body("emoji"))));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The gifs request resolves last and must not overwrite the emoji data.
    resolvers.gifs!(new Response(JSON.stringify(body("gifs"))));
    await new Promise((r) => setTimeout(r, 20));
    expect((result.current.data?.items[0] as unknown as { name: string }).name).toBe("emoji");
  });
});
