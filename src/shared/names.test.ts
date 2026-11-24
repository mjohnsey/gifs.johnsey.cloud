import { describe, expect, it } from "vitest";
import { isValidName, slugify } from "./names";

describe("slugify", () => {
  it.each([
    ["Robot Parrot.GIF", "robot-parrot"],
    ["let_me_in (1).png", "let-me-in-1"],
    ["  --Wut--  ", "wut"],
    ["emoji_😀", "emoji"],
    ["photo.jpeg", "photo"],
    ["Café Crème.png", "cafe-creme"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("truncates to 64 characters without a trailing hyphen", () => {
    const out = slugify(`${"a".repeat(63)} bbb`);
    expect(out).toBe("a".repeat(63));
    expect(slugify("x".repeat(100))).toHaveLength(64);
  });

  it("produces valid names", () => {
    expect(isValidName(slugify("Robot Parrot.GIF"))).toBe(true);
  });
});
