import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useItems } from "./api";

afterEach(() => vi.restoreAllMocks());

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

  it("aborts on unmount and updates nothing afterwards", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((r) => (resolve = r));
      }),
    );
    const { result, unmount } = renderHook(() => useItems("gifs"));
    unmount();
    expect(signal?.aborted).toBe(true);
    resolve(new Response(JSON.stringify({ items: [] })));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual({ loading: true });
    expect(errors).not.toHaveBeenCalled();
  });
});
