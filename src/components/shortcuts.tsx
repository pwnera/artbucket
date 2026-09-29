"use client";

import { useEffect, useRef } from "react";
import { useNavigate } from "@/components/app-sidebar";
import { useCan } from "@/components/can";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

type Shortcut = {
  /** A chord ("mod" is ⌘ or Ctrl), or with `sequence` keys pressed one after another. */
  keys: string[];
  sequence?: boolean;
  label: string;
  group: "General" | "Go to" | "Library" | "Guidelines";
  href?: string;
};

/**
 * Every key the app answers to, in one list: the "?" sheet shows it, the
 * palette and menus show their items' keys from it, and the go-to
 * sequences here are the ones useShortcuts binds. ⌘B belongs to the sidebar
 * (ui/sidebar.tsx), ⌘Z to undoable toasts (the builder's history first on
 * /brand), ⌘A and Esc to the library grid.
 */
export const SHORTCUTS: Shortcut[] = [
  { keys: ["mod", "K"], label: "Jump to anything", group: "General" },
  { keys: ["/"], label: "Filter this view", group: "General" },
  { keys: ["mod", "B"], label: "Show or hide the sidebar", group: "General" },
  { keys: ["mod", "Z"], label: "Undo, while its toast shows", group: "General" },
  { keys: ["mod", ","], label: "Open settings", group: "General", href: "/settings" },
  { keys: ["?"], label: "Keyboard shortcuts", group: "General" },
  { keys: ["G", "A"], sequence: true, label: "Assets", group: "Go to", href: "/" },
  { keys: ["G", "R"], sequence: true, label: "Review", group: "Go to", href: "/?review" },
  { keys: ["G", "G"], sequence: true, label: "Guidelines", group: "Go to", href: "/brand" },
  { keys: ["G", "Y"], sequence: true, label: "Activity", group: "Go to", href: "/activity" },
  { keys: ["G", "T"], sequence: true, label: "Team", group: "Go to", href: "/team" },
  { keys: ["G", "S"], sequence: true, label: "Settings", group: "Go to", href: "/settings" },
  { keys: ["mod", "A"], label: "Select every asset", group: "Library" },
  { keys: ["Esc"], label: "Clear the selection", group: "Library" },
  // Bound by the builder (components/builder/builder.tsx); J, K, [ and ] by the reader too (site/site-view.tsx).
  { keys: ["mod", "Z"], label: "Undo", group: "Guidelines" },
  { keys: ["mod", "⇧", "Z"], label: "Redo", group: "Guidelines" },
  { keys: ["P"], label: "Preview as readers see it", group: "Guidelines" },
  { keys: ["H"], label: "History", group: "Guidelines" },
  { keys: ["T"], label: "Tokens", group: "Guidelines" },
  { keys: ["Esc"], label: "Leave the preview, or deselect: the item, then its section", group: "Guidelines" },
  { keys: ["⇧", "Click"], label: "Add a section to the ones picked", group: "Guidelines" },
  { keys: ["J"], label: "Next section", group: "Guidelines" },
  { keys: ["K"], label: "Previous section", group: "Guidelines" },
  { keys: ["⌫"], label: "Delete the picked item, else the sections picked", group: "Guidelines" },
  { keys: ["mod", "D"], label: "Duplicate the picked item, else the section", group: "Guidelines" },
  { keys: ["⌥", "↑"], label: "Move the picked item or section up", group: "Guidelines" },
  { keys: ["⌥", "↓"], label: "Move the picked item or section down", group: "Guidelines" },
  { keys: ["["], label: "Previous page", group: "Guidelines" },
  { keys: ["]"], label: "Next page", group: "Guidelines" },
];

/** A shortcut's keys: a chord as one key cap, a sequence as caps one after another. */
export function Keys({ keys, sequence }: Pick<Shortcut, "keys" | "sequence">) {
  if (!sequence) return <Kbd keys={keys} />;
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <Kbd key={i} keys={[k]} />
      ))}
    </span>
  );
}

/** The sequence that goes to `to`, for the item that goes there too. */
export function GoKeys({ to }: { to: string }) {
  const s = SHORTCUTS.find((x) => x.sequence && x.href === to);
  return s ? <Keys {...s} /> : null;
}

/** Team is for whoever manages people or links; for anyone else it only bounces home. */
const useTeam = () => {
  const can = useCan();
  return can("member.manage") || can("share.manage");
};

/**
 * Typing, or a dialog, menu or select that answers keys itself (Radix typeahead doesn't
 * preventDefault): single keys are theirs until focus is back on the page.
 */
const busy = (t: EventTarget | null) =>
  t instanceof Element &&
  !!t.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=dialog], [role=alertdialog], [role=menu], [role=menubar], [role=listbox], [role=combobox]");

/**
 * The app's keys, bound once by the shell: ⌘K from anywhere, and away from
 * fields and dialogs "/" for the page's search, "?" for the sheet, ⌘, for
 * settings and G then a letter to go somewhere, within a second.
 */
export function useShortcuts({ setPalette, setHelp }: { setPalette: (open: boolean | ((o: boolean) => boolean)) => void; setHelp: (open: boolean) => void }) {
  const navigate = useNavigate();
  const team = useTeam();
  const armed = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.key.toLowerCase() === "k") {
        // Something under it took the key (a link, in the rule editor). cmdk's own Ctrl+K,
        // a Vim move, doesn't count: in the palette ⌘K still closes it.
        if (e.defaultPrevented && !(e.target instanceof Element && e.target.closest("[cmdk-root]"))) return;
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      if (busy(e.target)) armed.current = 0; // a G from before focus moved doesn't carry over
      if (e.defaultPrevented || e.repeat || busy(e.target)) return;
      if (mod && !e.altKey && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
        return;
      }
      if (mod || e.altKey) return;
      const key = e.key.toLowerCase();
      if (Date.now() - armed.current < 1000) {
        armed.current = 0;
        const to = SHORTCUTS.find((s) => s.sequence && s.keys[1].toLowerCase() === key)?.href;
        if (to && (to !== "/team" || team)) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      if (key === "g") armed.current = Date.now();
      else if (e.key === "/") {
        e.preventDefault();
        // The page's own field when it has one (the library's); ⌘K when it doesn't.
        const field = document.querySelector<HTMLInputElement>("[data-search]");
        if (field) {
          field.focus();
          field.select();
        } else setPalette(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, team, setPalette, setHelp]);
}

/** The "?" sheet: every shortcut, by group, as the keys to press. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const team = useTeam();
  const shown = SHORTCUTS.filter((s) => s.href !== "/team" || team);
  const groups = [...new Set(shown.map((s) => s.group))];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work anywhere outside a text field.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {groups.map((g) => (
            <section key={g} className="grid gap-1">
              <h3 className="text-muted-foreground text-xs font-medium">{g}</h3>
              <dl>
                {shown
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <div key={s.keys.join(" ")} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                      <dt>{s.label}</dt>
                      <dd>
                        <Keys {...s} />
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
