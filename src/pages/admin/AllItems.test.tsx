import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import type { Item } from "../../shared/types";
import { AllItems } from "./AllItems";

const item = (name: string, aliases: string[] = [], shelf: Item["shelf"] = "gifs"): Item => ({
  shelf, name, ext: shelf === "gifs" ? "gif" : "png", path: `/${shelf}/${name}.gif`, bytes: 1, width: 1, height: 1,
  aliases, posterPath: null, createdAt: "2026-01-01T00:00:00Z",
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(items: Item[], onDeleted = vi.fn()) {
  render(
    <ToastProvider>
      <AllItems items={items} onDeleted={onDeleted} onSignInRequired={vi.fn()} />
    </ToastProvider>,
  );
  return { onDeleted };
}

describe("AllItems", () => {
  it("lists every item, not only the newest 20, and deletes one with the shared confirm copy", async () => {
    const many = Array.from({ length: 30 }, (_, i) => item(`gif-${String(i).padStart(2, "0")}`));
    many.push(item("old-one", ["ancient"]));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: "old-one", aliases: ["ancient"] })));
    vi.stubGlobal("fetch", fetchMock);
    const { onDeleted } = setup(many);
    expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(31);
    fireEvent.click(screen.getByRole("button", { name: "Delete old-one" }));
    expect(confirm).toHaveBeenCalledWith(
      "Delete old-one? Its link will stop working everywhere it's been shared. Its aliases (ancient) go too.",
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/gifs/old-one", { method: "DELETE", redirect: "manual" });
  });

  it("filters by name or alias across both shelves", () => {
    setup([item("bunk-smh", ["smh"]), item("party", [], "emoji"), item("zed")]);
    fireEvent.change(screen.getByLabelText("Search all items"), { target: { value: "smh" } });
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("1 of 3 items match.");
    fireEvent.change(screen.getByLabelText("Search all items"), { target: { value: "part" } });
    expect(within(screen.getByRole("list")).getByText("party")).toBeTruthy();
  });
});
