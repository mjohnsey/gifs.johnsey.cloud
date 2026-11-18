import { useCallback } from "react";
import { useToast } from "../components/Toast";

/** Writes to the clipboard, falling back to execCommand where the async API is unavailable. */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    // navigator.clipboard is undefined on insecure origins; the TypeError lands in the fallback.
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall back for insecure contexts and older browsers.
    const previous = document.activeElement;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
      if (previous instanceof HTMLElement) previous.focus();
    }
  }
}

/** Returns copy(text, toast): copies, then announces `toast`, or an error toast on failure. Resolves to success. */
export function useCopy(): (text: string, toast: string) => Promise<boolean> {
  const notify = useToast();
  return useCallback(
    async (text, toast) => {
      if (!(await writeClipboard(text))) {
        notify("Couldn't copy. Select the text and copy it by hand.", "error");
        return false;
      }
      notify(toast);
      return true;
    },
    [notify],
  );
}
