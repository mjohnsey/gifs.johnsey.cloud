import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import type { Item } from "../../shared/types";
import { RecentList } from "./RecentList";

const item = (name: string, aliases: string[]): Item => ({
  shelf: "gifs", name, ext: "gif", path: `/gifs/${name}.gif`, bytes: 1, width: 1, height: 1,
  aliases, posterPath: null, createdAt: "2026-01-01T00:00:00Z",
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RecentList", () => {
  it("names the aliases in the confirm and deletes on yes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: "bunk-smh", aliases: ["smh", "bunk"] })));
    vi.stubGlobal("fetch", fetchMock);
    const onDeleted = vi.fn();
    render(
      <ToastProvider>
        <RecentList items={[item("bunk-smh", ["smh", "bunk"])]} onDeleted={onDeleted} onSignInRequired={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete bunk-smh" }));
    expect(confirm).toHaveBeenCalledWith(
      "Delete bunk-smh? Its link will stop working everywhere it's been shared. Its aliases (smh, bunk) go too.",
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/gifs/bunk-smh", { method: "DELETE" });
  });

  it("omits the alias sentence when there are none and does nothing on cancel", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ToastProvider>
        <RecentList items={[item("plain", [])]} onDeleted={vi.fn()} onSignInRequired={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete plain" }));
    expect(confirm).toHaveBeenCalledWith("Delete plain? Its link will stop working everywhere it's been shared.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
