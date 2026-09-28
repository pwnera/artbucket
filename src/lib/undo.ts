import { toast } from "sonner";

/** Undos on screen, newest last: Cmd/Ctrl+Z takes the newest, as an editor would. */
const stack: (() => void)[] = [];

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.key.toLowerCase() !== "z" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
  // A field has its own undo; the text you typed comes first.
  if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
  e.preventDefault();
  stack.at(-1)?.();
}

/**
 * A toast with Undo for 8s, and Cmd/Ctrl+Z while it shows. `undo` reports
 * for itself when it wants to ("Restored 3 files") by resolving false;
 * otherwise this says "Undone". A throw says it didn't work, so nobody
 * believes something is back when it isn't.
 */
export function undoable(message: string, { undo, description }: { undo: () => unknown; description?: React.ReactNode }) {
  let done = false;
  const leave = () => {
    const i = stack.indexOf(run);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) window.removeEventListener("keydown", onKey);
  };
  async function run() {
    if (done) return;
    done = true;
    leave();
    toast.dismiss(id);
    try {
      if ((await undo()) !== false) toast.success("Undone");
    } catch {
      toast.error("Couldn't undo that", { duration: 10_000 });
    }
  }
  if (!stack.length) window.addEventListener("keydown", onKey);
  stack.push(run);
  const id = toast(message, {
    description,
    duration: 8000,
    action: { label: "Undo", onClick: () => void run() },
    onDismiss: leave,
    onAutoClose: leave,
  });
  return id;
}
