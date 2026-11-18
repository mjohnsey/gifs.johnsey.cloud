import { useEffect, useRef, useState } from "react";
import { useCopy } from "../lib/copy";

interface Props {
  text: string;
  label: string;
  doneLabel?: string;
  /** Accessible name while idle, when the visible label is shorter, e.g. "Copy :name:". */
  ariaLabel?: string;
  /** Message for the toast, e.g. "Copied link to bunk-smh". */
  toast: string;
}

export function CopyButton({ text, label, doneLabel = "Copied", ariaLabel, toast }: Props) {
  const [done, setDone] = useState(false);
  const copyText = useCopy();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    if (!(await copyText(text, toast))) return;
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  }

  return (
    <button type="button" className={done ? "copy copied" : "copy"} onClick={copy} aria-label={done ? undefined : ariaLabel}>
      {done ? doneLabel : label}
    </button>
  );
}
