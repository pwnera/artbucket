import { useState } from "react";
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

/**
 * Runs `update` as a view transition: what it moves glides from where it was
 * (each element named with view-transition-name keeps its identity), the rest
 * crossfades. Plain `update` where the browser can't, or with less motion.
 */
export function transition(update: () => void) {
  if (!document.startViewTransition || still()) return update();
  document.startViewTransition(() => flushSync(update));
}

/**
 * The last value that was there: a dialog keeps showing its subject while it
 * fades out, instead of unmounting the moment its subject is cleared.
 * Render while `kept`, open while `value`.
 */
export function useKept<T>(value: T | null | undefined): T | null {
  const [kept, setKept] = useState(value ?? null);
  if (value != null && value !== kept) setKept(value);
  return value ?? kept;
}
