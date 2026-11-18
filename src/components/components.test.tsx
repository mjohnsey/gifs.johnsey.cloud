import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";
import { SearchBox } from "./SearchBox";
import { ToastProvider, useToast } from "./Toast";
import NotFound from "../pages/NotFound";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "execCommand");
});

function renderCopy() {
  return render(
    <ToastProvider>
      <CopyButton text="hello" label="Copy link" toast="Copied link to a" />
    </ToastProvider>,
  );
}

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
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copied link to a"));
  });
});

describe("CopyButton failure handling", () => {
  it("shows an error toast (not the signal style) when the clipboard rejects and execCommand fails", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    document.execCommand = vi.fn().mockReturnValue(false);
    renderCopy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    const toast = await screen.findByRole("status");
    await waitFor(() => expect(toast.textContent).toBe("Couldn't copy. Select the text and copy it by hand."));
    expect(toast.className).toContain("toast-error");
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("falls back to execCommand when the clipboard API is missing, and restores focus", async () => {
    Object.assign(navigator, { clipboard: undefined });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec;
    // jsdom's select() doesn't move focus; real browsers do, so mimic that.
    vi.spyOn(HTMLTextAreaElement.prototype, "select").mockImplementation(function (this: HTMLTextAreaElement) {
      this.focus();
    });
    renderCopy();
    const button = screen.getByRole("button", { name: "Copy link" });
    button.focus();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(document.activeElement).toBe(button);
    expect(document.querySelector("textarea")).toBeNull();
  });
});

describe("Toast", () => {
  it("re-announces an identical message and is hidden from assistive tech when idle", async () => {
    function Probe() {
      const notify = useToast();
      return <button onClick={() => notify("Same")}>go</button>;
    }
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    expect(document.querySelector(".toast")?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByText("go"));
    const toast = await screen.findByRole("status");
    await waitFor(() => expect(toast.textContent).toBe("Same"));
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(toast.textContent ?? ""));
    observer.observe(toast, { childList: true, characterData: true, subtree: true });
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(seen).toContain(""));
    await waitFor(() => expect(toast.textContent).toBe("Same"));
    observer.disconnect();
  });
});

describe("SearchBox", () => {
  it("does not steal or swallow / typed in another input", () => {
    render(
      <>
        <input aria-label="other" />
        <SearchBox value="" onChange={() => {}} label="Find a gif" />
      </>,
    );
    const other = screen.getByLabelText("other");
    other.focus();
    const notPrevented = fireEvent.keyDown(other, { key: "/" });
    expect(notPrevented).toBe(true);
    expect(document.activeElement).toBe(other);
  });

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
