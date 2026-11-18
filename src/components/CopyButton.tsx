import { useEffect, useRef, useState } from "react";
import { useCopy } from "../lib/copy";

interface Props {
  text: string;
  label: string;
  doneLabel?: string;
  /** Message for the toast, e.g. "Copied link to bunk-smh". */
  toast: string;
}

export function CopyButton({ text, label, doneLabel = "Copied", toast }: Props) {
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
    <button type="button" className={done ? "copy copied" : "copy"} onClick={copy}>
      {done ? doneLabel : label}
    </button>
  );
}
