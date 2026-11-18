import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AppRoutes } from "./App";

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output>{pathname + search}</output>;
}

function at(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
      <Where />
    </MemoryRouter>,
  );
}

describe("routes", () => {
  it("redirects /gifs?q=x to /gifs/?q=x", () => {
    at("/gifs?q=x");
    expect(screen.getByRole("status").textContent).toBe("/gifs/?q=x");
  });
  it("redirects /emoji to /emoji/", () => {
    at("/emoji");
    expect(screen.getByRole("status").textContent).toBe("/emoji/");
  });
  it("keeps /gifs/ as is", () => {
    at("/gifs/");
    expect(screen.getByRole("status").textContent).toBe("/gifs/");
  });
  it("shows the 404 copy for unknown paths", () => {
    at("/nope");
    expect(screen.getByRole("heading").textContent).toBe("Nothing here. Try the gifs or the emoji.");
  });
});
