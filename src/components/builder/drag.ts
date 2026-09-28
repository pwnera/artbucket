import type { Template } from "@/lib/pages";

/**
 * What is being dragged in the builder, for the places it can land: a
 * section by its handle, an item by its grip, a block or a rule from the
 * Add panel, files from the desktop. A drop target can only read a drag's
 * types until the drop, so the builder's own drags also leave their
 * payload here while they last (one window, one drag at a time).
 */
export type Payload =
  | { kind: "section"; id: string }
  | { kind: "item"; section: string; i: number }
  | { kind: "template"; template: Template }
  | { kind: "rule"; key: string }
  | { kind: "files" };

/** The builder's drags carry this type, so nothing else (a link, a picture) is taken for one. */
export const DRAG = "application/x-brand-builder";

let current: Payload | null = null;

/** Start one of the builder's drags. */
export function startDrag(e: React.DragEvent, p: Payload, effect: "move" | "copy" = "move") {
  current = p;
  e.dataTransfer.effectAllowed = effect;
  e.dataTransfer.setData(DRAG, JSON.stringify(p));
}

export const endDrag = () => {
  current = null;
};

/** What a drag over here carries: the builder's own, files from the desktop, or nothing it takes. */
export function payloadOf(e: React.DragEvent): Payload | null {
  const types = e.dataTransfer.types;
  if (types.includes(DRAG)) return current;
  return types.includes("Files") ? { kind: "files" } : null;
}
