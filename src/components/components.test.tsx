import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";
import { SearchBox } from "./SearchBox";
import { ToastProvider } from "./Toast";
import NotFound from "../pages/NotFound";

afterEach(cleanup);

describe("CopyButton", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("copies the text, flips to the done label and announces the toast", async () => {
    render(
      <ToastProvider>
        <CopyButton text="https://stash.johnsey.cloud/gifs/a.gif" label="Copy link" toast="Copied link to a" />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://stash.johnsey.cloud/gifs/a.gif");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Copied link to a");
  });
});

describe("SearchBox", () => {
  it("focuses on / and clears on Escape; Enter calls onEnter", () => {
    const onChange = vi.fn();
    const onEnter = vi.fn();
    render(<SearchBox value="parrot" onChange={onChange} onEnter={onEnter} label="Find a gif" />);
    const input = screen.getByRole("searchbox", { name: "Find a gif" });
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onEnter).toHaveBeenCalledOnce();
  });
});

describe("NotFound", () => {
  it("shows the copy with links to both shelves", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading").textContent).toBe("Nothing here. Try the gifs or the emoji.");
    expect(screen.getByRole("link", { name: "the gifs" }).getAttribute("href")).toBe("/gifs/");
    expect(screen.getByRole("link", { name: "the emoji" }).getAttribute("href")).toBe("/emoji/");
  });
});
