import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/Toast";
import type { Item, ItemsResponse } from "../shared/types";
import Emoji from "./Emoji";

function emoji(name: string, extra: Partial<Item> = {}): Item {
  return {
    shelf: "emoji",
    name,
    ext: "png",
    path: `/emoji/${name}.png`,
    bytes: 1000,
    width: 128,
    height: 128,
    aliases: [],
    posterPath: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

const RESPONSE: ItemsResponse = {
  canonicalOrigin: "https://stash.johnsey.cloud",
  adminAvailable: false,
  items: [emoji("robot-parrot", { ext: "gif", path: "/emoji/robot-parrot.gif", aliases: ["botparrot"] }), emoji("thumbs-up")],
};

function renderEmoji(response: ItemsResponse = RESPONSE, url = "/emoji/") {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response))));
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Emoji />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "execCommand");
});

describe("Emoji shelf", () => {
  it("shows each emoji at 64x64 with its :name: and the count", async () => {
    renderEmoji();
    await screen.findByText(":robot-parrot:");
    expect(screen.getByText("2 emoji. Press / to search, Enter to copy the first match.")).toBeTruthy();
    const img = document.querySelector<HTMLImageElement>(".emoji-page img")!;
    expect(img.getAttribute("src")).toBe("/emoji/robot-parrot.gif");
    expect(img.getAttribute("width")).toBe("64");
    expect(img.getAttribute("height")).toBe("64");
  });

  it("gives the Download link the file name in its download attribute", async () => {
    renderEmoji();
    await screen.findByText(":robot-parrot:");
    const links = screen.getAllByRole("link", { name: /^Download :/ });
    expect(links[0].getAttribute("href")).toBe("/emoji/robot-parrot.gif");
    expect(links[0].getAttribute("download")).toBe("robot-parrot.gif");
    expect(links[1].getAttribute("download")).toBe("thumbs-up.png");
    expect(links[0].getAttribute("aria-label")).toBe("Download :robot-parrot:");
    expect(links[0].textContent).toBe("Download");
  });

  it("copies :name: and toasts Copied :name:", async () => {
    renderEmoji();
    await screen.findByText(":robot-parrot:");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy :robot-parrot:" }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(":robot-parrot:");
    expect(screen.getByRole("button", { name: "Copied" }).textContent).toBe("Copied");
    await waitFor(() => expect(screen.getByRole("status", { hidden: true }).textContent).toBe("Copied :robot-parrot:"));
  });

  it("filters by name or alias and reports the match count", async () => {
    renderEmoji();
    await screen.findByText(":robot-parrot:");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "botparrot" } });
    expect(screen.getByText(":robot-parrot:")).toBeTruthy();
    expect(screen.queryByText(":thumbs-up:")).toBeNull();
    expect(screen.getByText("1 of 2 emoji match.")).toBeTruthy();
  });

  it("copies the first match's :name: on Enter", async () => {
    renderEmoji();
    await screen.findByText(":robot-parrot:");
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "thumbs" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(":thumbs-up:");
  });

  it("says so when nothing matches", async () => {
    renderEmoji(RESPONSE, "/emoji/?q=zzz");
    expect(await screen.findByText('No emoji match "zzz". Try a shorter word.')).toBeTruthy();
  });

  it("shows the empty-shelf copy without an admin link when admin is unavailable", async () => {
    renderEmoji({ ...RESPONSE, items: [] });
    expect(await screen.findByText(/No emoji yet\./)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "admin page" })).toBeNull();
    expect(document.querySelector(".empty")!.textContent).toBe("No emoji yet. Add some from the admin page.");
  });

  it("links the admin page from the empty shelf when admin is available", async () => {
    renderEmoji({ ...RESPONSE, adminAvailable: true, items: [] });
    const link = await screen.findByRole("link", { name: "admin page" });
    expect(link.getAttribute("href")).toBe("/admin");
    expect(document.querySelector(".empty")!.textContent).toBe("No emoji yet. Add some from the admin page.");
  });

  it("uses a plain anchor for the admin link so Cloudflare Access can intercept the navigation", async () => {
    renderEmoji({ ...RESPONSE, adminAvailable: true, items: [] });
    const link = await screen.findByRole("link", { name: "admin page" });
    let routerHandled = true;
    const probe = (e: Event) => {
      routerHandled = e.defaultPrevented; // a router <Link> calls preventDefault before this runs
      e.preventDefault(); // keep jsdom from "navigating"
    };
    document.addEventListener("click", probe);
    fireEvent.click(link);
    document.removeEventListener("click", probe);
    expect(routerHandled).toBe(false);
  });
});
