import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

interface Props {
  text: string;
  label: string;
  doneLabel?: string;
  /** Message for the toast, e.g. "Copied link to bunk-smh". */
  toast: string;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall back for insecure contexts and older browsers.
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
    }
  }
}

export function CopyButton({ text, label, doneLabel = "Copied", toast }: Props) {
  const [done, setDone] = useState(false);
  const notify = useToast();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    if (!(await writeClipboard(text))) {
      notify("Couldn't copy. Select the text and copy it by hand.");
      return;
    }
    notify(toast);
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  }

  return (
    <button type="button" className={done ? "copy copied" : "copy"} onClick={copy}>
      {done ? doneLabel : label}
    </button>
  );
}
