import { createElement, useEffect, useRef, useState, ViewTransition } from "react";
import { flushSync } from "react-dom";

/**
 * The app's few motion helpers, for the browser only. What moves and how is
 * CSS (globals.css): these start it from code, and keep still for anyone who
 * asked for less motion.
 */

/** Asked for less motion. */
export const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Smooth, unless the reader asked for less motion. */
export const behavior = (): ScrollBehavior => (still() ? "auto" : "smooth");

/**
 * It lights up and fades ([data-flash] in globals.css): where something just
 * landed, changed or came back. A selector waits a frame for the render that
 * brings its elements, then flashes every match.
 */
export function flash(target: HTMLElement | string | null | undefined) {
  if (typeof target === "string") {
    requestAnimationFrame(() => document.querySelectorAll<HTMLElement>(target).forEach(flash));
    return;
  }
  if (!target) return;
  target.removeAttribute("data-flash");
  // A reflow between the two restarts the animation.
  void target.offsetWidth;
  target.setAttribute("data-flash", "");
  setTimeout(() => target.removeAttribute("data-flash"), 1600);
}

/** A small no-shake ([data-shake] in globals.css): what was typed was refused. */
export function shake(el: Element | null | undefined) {
  if (!el) return;
  el.removeAttribute("data-shake");
  void (el as HTMLElement).offsetWidth;
  el.setAttribute("data-shake", "");
  setTimeout(() => el.removeAttribute("data-shake"), 300);
}

/**
 * Runs `update` as a view transition: what it moves glides from where it was,
 * the rest crossfades. An element keeps its identity across it by `data-vt`
 * (a name unique on the page), named only while the transition runs, so
 * nothing is named at rest and two lists can't clash. Plain `update` where
 * the browser can't, or with less motion.
 */
export function transition(update: () => void) {
  if (!document.startViewTransition || still()) return update();
  const named: HTMLElement[] = [];
  const name = () => {
    // An element that gave up its name in the update (a tile now open in the viewer) drops it, or the name would be taken twice.
    named.splice(0).forEach((el) => (el.style.viewTransitionName = ""));
    document.querySelectorAll<HTMLElement>("[data-vt]").forEach((el) => {
      el.style.viewTransitionName = el.dataset.vt!;
      named.push(el);
    });
  };
  name();
  const t = document.startViewTransition(() => {
    flushSync(update);
    // What the update drew new is named too, before the new state is captured.
    name();
  });
  void t.finished.finally(() => named.forEach((el) => (el.style.viewTransitionName = "")));
}

/**
 * Folds `el` away ([data-collapsing] in globals.css), then runs `then`, which
 * removes it. With less motion, or no element, at once. If `then` leaves it
 * on the page (a refused delete puts it back), it opens again.
 */
export function collapse(target: Element | Iterable<Element> | null | undefined, then: () => void) {
  const els = !target ? [] : target instanceof Element ? [target] : [...target];
  if (!els.length || still()) return then();
  els.forEach((el) => el.setAttribute("data-collapsing", ""));
  setTimeout(() => {
    then();
    requestAnimationFrame(() => els.forEach((el) => el.removeAttribute("data-collapsing")));
  }, 150);
}

/**
 * One thing seen in two places, a tile and the viewer: React moves it from
 * one to the other when a navigation swaps them (a shared view transition),
 * and nothing else animates. `name` unique on the page; null drops it here
 * (the tile while its picture is in the viewer). Asked for less motion, the
 * CSS keeps it still.
 */
export function Morph({ name, children }: { name: string | null; children: React.ReactNode }) {
  return name ? createElement(ViewTransition, { name, share: "auto", default: "none" }, children) : children;
}

/**
 * Flashes the rows of `ids` that weren't there last render (`at` finds a
 * row by id): what a refresh brought in shows itself. Never on first render.
 */
export function useFlashNew(ids: string[], at: (id: string) => string) {
  const seen = useRef<Set<string> | null>(null);
  const key = ids.join(" ");
  useEffect(() => {
    const before = seen.current;
    seen.current = new Set(ids);
    if (before) ids.filter((id) => !before.has(id)).forEach((id) => flash(at(id)));
    // Keyed on the ids themselves: a new array of the same rows is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * The last value that was there, for as long as a dialog takes to leave: it
 * fades out still showing its subject, instead of unmounting the moment its
 * subject is cleared, and opens fresh next time. Render while kept, open
 * while `value`.
 */
export function useKept<T>(value: T | null | undefined): T | null {
  const [kept, setKept] = useState(value ?? null);
  if (value != null && value !== kept) setKept(value);
  useEffect(() => {
    if (value != null || kept == null) return;
    const t = setTimeout(() => setKept(null), 200);
    return () => clearTimeout(t);
  }, [value, kept]);
  return value ?? kept;
}
