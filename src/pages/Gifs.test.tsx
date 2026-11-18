import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/Toast";
import type { Item, ItemsResponse } from "../shared/types";
import Gifs from "./Gifs";

function gif(name: string, extra: Partial<Item> = {}): Item {
  return {
    shelf: "gifs",
    name,
    ext: "gif",
    path: `/gifs/${name}.gif`,
    bytes: 1000,
    width: 400,
    height: 300,
    aliases: [],
    posterPath: `/posters/${name}.webp`,
    createdAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

const RESPONSE: ItemsResponse = {
  canonicalOrigin: "https://stash.johnsey.cloud",
  adminAvailable: false,
  items: [
    gif("bunk-smh", { aliases: ["smh", "shaking-head"] }),
    gif("robot-parrot"),
    gif("no-poster", { posterPath: null }),
  ],
};

function renderGifs(url = "/gifs/") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Gifs />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(RESPONSE))));
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Gifs shelf", () => {
  it("lists every gif with the count in the status line", async () => {
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    expect(screen.getByText("3 gifs. Press / to search, Enter to copy the first match.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "bunk-smh" }).getAttribute("href")).toBe("/gifs/bunk-smh.gif");
    expect(screen.getByRole("link", { name: "smh" }).getAttribute("href")).toBe("/gifs/smh.gif");
  });

  it("shows the stored poster lazily, and falls back to the gif when there is none", async () => {
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    const posters = document.querySelectorAll<HTMLImageElement>(".screen img");
    expect(posters[0].getAttribute("src")).toBe("/posters/bunk-smh.webp");
    expect(posters[0].getAttribute("loading")).toBe("lazy");
    expect(posters[2].getAttribute("src")).toBe("/gifs/no-poster.gif");
  });

  it("filters by an alias term and reports the match count", async () => {
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "shaking" } });
    expect(screen.getByRole("link", { name: "bunk-smh" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "robot-parrot" })).toBeNull();
    expect(screen.getByText("1 of 3 gifs match.")).toBeTruthy();
  });

  it("matches every hyphen- or space-separated term", async () => {
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "robot smh" } });
    expect(screen.getByText('No gifs match "robot smh". Try a shorter word.')).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bunk-smh" } });
    expect(screen.getByText("1 of 3 gifs match.")).toBeTruthy();
  });

  it("plays on click: swaps to the gif and sets aria-pressed, then stops on a second click", async () => {
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    const screenButton = screen.getByRole("button", { name: "Play bunk-smh" });
    expect(screenButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screenButton);
    expect(screenButton.getAttribute("aria-pressed")).toBe("true");
    expect(screenButton.getAttribute("aria-label")).toBe("Stop bunk-smh");
    expect(screenButton.querySelector("img")!.getAttribute("src")).toBe("/gifs/bunk-smh.gif");
    fireEvent.click(screenButton);
    expect(screenButton.getAttribute("aria-pressed")).toBe("false");
    expect(screenButton.querySelector("img")!.getAttribute("src")).toBe("/posters/bunk-smh.webp");
  });

  it("plays on hover only when a fine hovering pointer is present and motion is allowed", async () => {
    const matches = { "(hover: hover) and (pointer: fine)": true, "(prefers-reduced-motion: reduce)": false };
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: matches[q as keyof typeof matches] ?? false }));
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    const button = screen.getByRole("button", { name: "Play bunk-smh" });
    fireEvent.pointerEnter(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerLeave(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    matches["(prefers-reduced-motion: reduce)"] = true;
    fireEvent.pointerEnter(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("copies the canonical link", async () => {
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    const copy = screen.getAllByRole("button", { name: "Copy link" })[0];
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://stash.johnsey.cloud/gifs/bunk-smh.gif");
    await waitFor(() => expect(screen.getByRole("status", { hidden: true }).textContent).toBe("Copied link to bunk-smh"));
  });

  it("copies the first match on Enter", async () => {
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "parrot" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://stash.johnsey.cloud/gifs/robot-parrot.gif");
  });

  it("initialises the search from ?q= and shows the empty copy when nothing matches", async () => {
    renderGifs("/gifs/?q=zzz");
    expect(await screen.findByText('No gifs match "zzz". Try a shorter word.')).toBeTruthy();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("zzz");
    expect(screen.queryByRole("link", { name: "bunk-smh" })).toBeNull();
  });

  it("says so when the shelf fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    renderGifs();
    expect(await screen.findByText("Couldn't load the gifs (500).")).toBeTruthy();
  });
});

describe("Gifs Enter-to-copy fallback", () => {
  afterEach(() => Reflect.deleteProperty(document, "execCommand"));

  it("uses the execCommand fallback when the clipboard API is missing", async () => {
    Object.assign(navigator, { clipboard: undefined });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec;
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "parrot" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(exec).toHaveBeenCalledWith("copy");
    await waitFor(() => expect(screen.getByRole("status", { hidden: true }).textContent).toBe("Copied link to robot-parrot"));
  });

  it("tells the user the link when both clipboard routes fail", async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false);
    renderGifs();
    await screen.findByRole("link", { name: "bunk-smh" });
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "parrot" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() =>
      expect(screen.getByRole("status", { hidden: true }).textContent).toBe(
        "Couldn't copy. The link is https://stash.johnsey.cloud/gifs/robot-parrot.gif",
      ),
    );
  });
});
