import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import type { Item } from "../../shared/types";
import { AddQueue } from "./AddQueue";

vi.mock("./poster", () => ({
  measureImage: vi.fn().mockResolvedValue({ width: 64, height: 64 }),
  makePoster: vi.fn().mockResolvedValue(null),
}));

const ORIGIN = "https://stash.johnsey.cloud";

function file(name: string, type: string): File {
  return new File([new Uint8Array(10)], name, { type });
}

function existing(name: string, aliases: string[] = []): Item {
  return {
    shelf: "emoji", name, ext: "png", path: `/emoji/${name}.png`, bytes: 1, width: 1, height: 1,
    aliases, posterPath: null, createdAt: "2026-01-01T00:00:00Z",
  };
}

function setup(items: Item[] = [], onSaved = vi.fn(), onSignInRequired = vi.fn()) {
  render(
    <ToastProvider>
      <AddQueue items={items} canonicalOrigin={ORIGIN} onSaved={onSaved} onSignInRequired={onSignInRequired} />
    </ToastProvider>,
  );
  return { onSaved, onSignInRequired };
}

async function addFiles(...files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

const nameBoxes = () => screen.getAllByLabelText("Name") as HTMLInputElement[];

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AddQueue", () => {
  it("adds two files as two rows with slugified names", async () => {
    setup();
    await addFiles(file("Robot Parrot.GIF", "image/gif"), file("let_me_in (1).png", "image/png"));
    expect(nameBoxes().map((b) => b.value)).toEqual(["robot-parrot", "let-me-in-1"]);
  });

  it("disables Save for only the row with an invalid or taken name", async () => {
    setup([existing("taken-one")]);
    await addFiles(file("a.gif", "image/gif"), file("taken-one.png", "image/png"));
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[1]).getByText("taken-one is already taken.")).toBeTruthy();
    expect((within(rows[0]).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(rows[1]).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(nameBoxes()[0], { target: { value: "Bad Name" } });
    expect((within(rows[0]).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("treats an existing alias as taken", async () => {
    setup([existing("bunk-smh", ["smh"])]);
    await addFiles(file("smh.png", "image/png"));
    expect(screen.getByText("smh is already taken.")).toBeTruthy();
  });

  it("Save all keeps a 409 row with its error and marks the other Saved", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const name = (init.body as FormData).get("name");
      if (name === "second") return new Response(JSON.stringify({ error: "second is already taken." }), { status: 409 });
      return new Response(JSON.stringify({ item: existing("first"), url: `${ORIGIN}/emoji/first.png` }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onSaved } = setup();
    await addFiles(file("first.png", "image/png"), file("second.png", "image/png"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save all" }));
    });
    await waitFor(() => expect(screen.getByText("second is already taken.")).toBeTruthy());
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Saved")).toBeTruthy();
    expect(within(rows[0]).getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(within(rows[1]).queryByText("Saved")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("asks to sign in on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 })));
    const { onSignInRequired } = setup();
    await addFiles(file("a.png", "image/png"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save all" }));
    });
    await waitFor(() => expect(onSignInRequired).toHaveBeenCalled());
  });

  it("warns that only GIFs fit the gifs shelf and blocks the save", async () => {
    setup();
    await addFiles(file("a.png", "image/png"));
    fireEvent.click(screen.getByRole("radio", { name: "Gifs" }));
    expect(screen.getByText("Only GIFs can go on the gifs shelf.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
