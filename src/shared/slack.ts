import type { Ext } from "./types";

// Slack's help page (https://slack.com/help/articles/206870177-Add-custom-emoji-and-aliases-to-your-workspace)
// gives no hard limits: it says "Square images under 128KB and with transparent
// backgrounds work best" and that JPG, PNG and GIF are accepted. So these are
// the recommended values, and they produce warnings, never errors.
const MAX_BYTES = 128 * 1024;
const MAX_SIDE = 128;

export function slackWarnings(file: { bytes: number; width: number; height: number; ext: Ext }): string[] {
  const warnings: string[] = [];
  if (file.bytes > MAX_BYTES) {
    warnings.push(`Slack works best with emoji under 128 KB. This one is ${Math.round(file.bytes / 1024)} KB.`);
  }
  if (file.width > MAX_SIDE || file.height > MAX_SIDE) {
    warnings.push(`Slack shrinks emoji to 128x128. This one is ${file.width}x${file.height}.`);
  }
  return warnings;
}
