import { describe, expect, it } from "vitest";
import { absoluteUrl, emojiCode } from "./links";

describe("absoluteUrl", () => {
  it("joins origin and path", () => {
    expect(absoluteUrl("https://stash.johnsey.cloud", "/gifs/a.gif")).toBe("https://stash.johnsey.cloud/gifs/a.gif");
  });
  it("tolerates a trailing slash on the origin and a missing leading slash", () => {
    expect(absoluteUrl("https://stash.johnsey.cloud/", "gifs/a.gif")).toBe("https://stash.johnsey.cloud/gifs/a.gif");
  });
});

describe("emojiCode", () => {
  it("wraps the name in colons", () => {
    expect(emojiCode("party-parrot")).toBe(":party-parrot:");
  });
});
