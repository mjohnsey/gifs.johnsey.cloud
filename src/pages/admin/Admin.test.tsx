import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import Admin from "./Admin";
import { MemoryRouter } from "react-router";

vi.mock("./poster", () => ({
  measureImage: vi.fn().mockResolvedValue({ width: 64, height: 64 }),
  makePoster: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Admin", () => {
  it("keeps the queue mounted and shows the sign-in message above it on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/items")) return new Response(JSON.stringify({ canonicalOrigin: "https://stash.johnsey.cloud", adminAvailable: true, items: [] }));
        if (url === "/api/admin/recent") return new Response(JSON.stringify({ items: [] }));
        if (init?.method === "POST") return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 });
        throw new Error(url);
      }),
    );
    render(
      <MemoryRouter>
        <ToastProvider>
          <Admin />
        </ToastProvider>
      </MemoryRouter>,
    );
    const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[type="file"]')!);
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([new Uint8Array(4)], "a.png", { type: "image/png" })] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save all" }));
    });
    expect((await screen.findByRole("alert")).textContent).toBe("Sign in required. Open this page on stash.johnsey.cloud.");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("a");
  });
});
