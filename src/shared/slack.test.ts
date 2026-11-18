import { describe, expect, it } from "vitest";
import { slackWarnings } from "./slack";

describe("slackWarnings", () => {
  it("is quiet for a 64x64, 10 KB png", () => {
    expect(slackWarnings({ bytes: 10 * 1024, width: 64, height: 64, ext: "png" })).toEqual([]);
  });

  it("warns when the file is over 128 KB", () => {
    const w = slackWarnings({ bytes: 200 * 1024, width: 64, height: 64, ext: "gif" });
    expect(w).toEqual(["Slack works best with emoji under 128 KB. This one is 200 KB."]);
  });

  it("warns when the image is over 128x128", () => {
    const w = slackWarnings({ bytes: 10 * 1024, width: 400, height: 300, ext: "png" });
    expect(w).toEqual(["Slack shrinks emoji to 128x128. This one is 400x300."]);
  });

  it("can return both warnings", () => {
    expect(slackWarnings({ bytes: 500 * 1024, width: 256, height: 128, ext: "jpg" })).toHaveLength(2);
  });
});
