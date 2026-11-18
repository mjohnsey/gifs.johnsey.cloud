import { describe, expect, it } from "vitest";
import { guessShelf } from "./guess";

describe("guessShelf", () => {
  it("puts a small light gif on emoji", () => {
    expect(guessShelf({ ext: "gif", bytes: 40 * 1024, width: 64, height: 64 })).toBe("emoji");
  });
  it("puts a big gif on gifs", () => {
    expect(guessShelf({ ext: "gif", bytes: 2 * 1024 * 1024, width: 480, height: 270 })).toBe("gifs");
  });
  it("puts any non-gif on emoji", () => {
    expect(guessShelf({ ext: "png", bytes: 900_000, width: 900, height: 900 })).toBe("emoji");
    expect(guessShelf({ ext: "jpg", bytes: 10, width: 10, height: 10 })).toBe("emoji");
  });
  it("applies the 256 px and 512 KB limits inclusively", () => {
    expect(guessShelf({ ext: "gif", bytes: 512 * 1024, width: 256, height: 256 })).toBe("emoji");
    expect(guessShelf({ ext: "gif", bytes: 512 * 1024 + 1, width: 256, height: 256 })).toBe("gifs");
    expect(guessShelf({ ext: "gif", bytes: 1000, width: 257, height: 100 })).toBe("gifs");
  });
});
