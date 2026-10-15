import preview from "#.storybook/preview";
import { useRef, useState, useSyncExternalStore } from "react";
import { expect, screen, waitFor, within } from "storybook/test";
import { IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collapse, flash, shake, transition, useCountUp } from "@/lib/motion";
import { undoable } from "@/lib/undo";

/**
 * The app's motion, live: the house easings, and the few helpers in lib/motion.ts that start a CSS motion from
 * code. The page (.storybook/docs/motion.mdx) says when each is used; each story here is also a test.
 */
const meta = preview.meta({
  title: "Foundations/Motion",
  // The docs page is motion.mdx, attached to these stories.
  tags: ["!autodocs"],
});

const EASES = ["--ease-out", "--ease-in", "--ease-in-out"] as const;
const never = () => () => {};

/** A token's value as the page has it (globals.css), so the story never drifts from it. */
function Value({ name }: { name: string }) {
  const v = useSyncExternalStore(never, () => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), () => "");
  return <span className="text-muted-foreground">{v}</span>;
}

function Easings() {
  const [on, setOn] = useState(false);
  return (
    <div className="grid max-w-xl gap-4">
      <Button variant="outline" className="justify-self-start" aria-pressed={on} onClick={() => setOn(!on)}>
        {on ? "Back" : "Play"}
      </Button>
      {EASES.map((e) => (
        <div key={e} className="grid gap-1">
          <code className="font-mono text-xs">
            {e}: <Value name={e} />
          </code>
          <div className="bg-muted relative h-8 rounded-full">
            <span
              data-testid={e}
              className="bg-primary absolute top-1 left-1 size-6 rounded-full transition-[translate] duration-700"
              style={{ transitionTimingFunction: `var(${e})`, translate: on ? "calc(min(36rem, 100vw - 6rem) - 2rem)" : "0" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Things arrive on the quick ease-out, leave faster on the ease-in; ease-in-out only for what moves on screen and stays. Played slow (700ms) to be seen. */
export const Easing = meta.story({
  render: () => <Easings />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Play" }));
    await expect(canvas.getByRole("button", { name: "Back" })).toHaveAttribute("aria-pressed", "true");
  },
});

function FlashDemo() {
  const row = useRef<HTMLLIElement>(null);
  return (
    <div className="grid max-w-sm gap-3">
      <ul className="divide-y rounded-lg border text-sm">
        <li className="px-3 py-2">logo-primary.svg</li>
        <li ref={row} className="px-3 py-2">
          spring-hero.psd
        </li>
        <li className="px-3 py-2">tagline.txt</li>
      </ul>
      <Button variant="outline" className="justify-self-start" onClick={() => flash(row.current)}>
        Replace spring-hero.psd
      </Button>
    </div>
  );
}

/** flash(): where something just landed, changed or came back lights up and fades ([data-flash], 1.6s). */
export const Flash = meta.story({
  render: () => <FlashDemo />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Replace spring-hero.psd" }));
    await expect(canvas.getByText("spring-hero.psd")).toHaveAttribute("data-flash");
  },
});

function ShakeDemo() {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  return (
    <form
      className="flex max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) shake(input.current);
      }}
    >
      <Input ref={input} aria-label="Collection name" placeholder="Spring 2026" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit">Create</Button>
    </form>
  );
}

/** shake(): a small no, as a head shakes it: what was typed was refused (an empty name, a wrong password). */
export const Shake = meta.story({
  render: () => <ShakeDemo />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    await expect(canvas.getByRole("textbox", { name: "Collection name" })).toHaveAttribute("data-shake");
  },
});

const ASSETS = ["logo-primary.svg", "spring-hero.psd", "tagline.txt"];

function CollapseUndo() {
  const [rows, setRows] = useState(ASSETS);
  const refs = useRef(new Map<string, HTMLLIElement>());
  const remove = (name: string) =>
    collapse(refs.current.get(name), () => {
      setRows((r) => r.filter((x) => x !== name));
      undoable(`Deleted ${name}`, { undo: () => setRows((r) => ASSETS.filter((x) => r.includes(x) || x === name)) });
    });
  return (
    <ul className="max-w-sm divide-y rounded-lg border text-sm">
      {rows.map((name) => (
        <li
          key={name}
          ref={(el) => {
            if (el) refs.current.set(name, el);
          }}
          className="flex items-center justify-between gap-2 py-1 ps-3 pe-1"
        >
          {name}
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} onClick={() => remove(name)}>
            <IconTrash />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * collapse() then undoable(): a row on its way out folds its height away (150ms, ease-in), so the rows below close
 * the gap; the toast offers Undo for 8s, and Cmd/Ctrl+Z while it shows.
 */
export const CollapseAndUndo = meta.story({
  render: () => <CollapseUndo />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete spring-hero.psd" }));
    await waitFor(() => expect(canvas.queryByText("spring-hero.psd")).not.toBeInTheDocument());
    await expect(await screen.findByText("Deleted spring-hero.psd")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await expect(await canvas.findByText("spring-hero.psd")).toBeInTheDocument();
    await expect(await screen.findByText("Undone")).toBeInTheDocument();
  },
});

function Sort() {
  const [rows, setRows] = useState(["Tagline", "Logo", "Color", "Voice"]);
  return (
    <div className="grid max-w-sm gap-3">
      <Button variant="outline" className="justify-self-start" onClick={() => transition(() => setRows((r) => [...r].sort()))}>
        Sort by name
      </Button>
      <ol aria-label="Pages" className="grid gap-2 text-sm">
        {rows.map((r) => (
          <li key={r} data-vt={`motion-${r}`} className="bg-card rounded-lg border px-3 py-2">
            {r}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** transition(): what a change moves glides from where it was, the rest crossfades (a view transition, 200ms). */
export const Rearrange = meta.story({
  render: () => <Sort />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sort by name" }));
    await waitFor(() => expect(within(canvas.getByRole("list", { name: "Pages" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Color", "Logo", "Tagline", "Voice"]));
  },
});

function Score() {
  const n = useCountUp(86);
  return (
    <p className="font-display text-4xl font-semibold tabular-nums">
      {n}
      <span className="text-muted-foreground text-base font-normal"> / 100 Brand Agent Score</span>
    </p>
  );
}

/** useCountUp(): a score or a total counts up on the house ease-out (700ms), from where it was after the first time. */
export const CountUp = meta.story({
  render: () => <Score />,
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText("86")).toBeInTheDocument());
  },
});
