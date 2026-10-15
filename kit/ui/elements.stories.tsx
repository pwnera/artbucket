import preview from "../../.storybook/preview";
import { useEffect, useRef } from "react";
import { expect, waitFor } from "storybook/test";
import { fixtureView } from "@/lib/fixtures/brand-book";
import { define } from "./elements.js";
import type { Rule } from "./html.js";
import "./ui.css";

const RULES: Rule[] = fixtureView("blender").rules;

type Name = "ab-palette" | "ab-type" | "ab-logos" | "ab-rules" | "ab-rule";

/**
 * One of the kit's elements with its `rules` set as a property, as a page with the release in hand does (else
 * `src="/brand.json"` fetches an export, its files beside it). A file loads from its export path under the site's
 * root: here the app's icon (public/icon.svg) stands in for each.
 */
function Element({ name, keys, rule }: { name: Name; keys?: string; rule?: string }) {
  const ref = useRef<HTMLElement & { rules?: Rule[] }>(null);
  useEffect(() => {
    define();
    const el = ref.current!;
    if (rule) el.setAttribute("key", rule);
    el.rules = RULES.map((r) => ({ ...r, assets: r.assets?.map((a) => ({ ...a, file: "icon.svg" })) }));
  }, [rule]);
  const Tag = name as unknown as React.ElementType;
  return <Tag ref={ref} keys={keys} />;
}

/**
 * `@artbucket/ui/elements`: the drawings as web components, for any framework or none. `define()` registers
 * `<ab-palette>`, `<ab-type>`, `<ab-logos>`, `<ab-rules>` and `<ab-rule>`, once (nothing without a DOM); each draws
 * into its own children, so the page's CSS reaches them. MIT.
 *
 * ```js
 * import { define } from "@artbucket/ui/elements"; // <ab-palette src="/brand.json">
 * ```
 */
const meta = preview.meta({ title: "Kit/Web components", component: Element, args: { name: "ab-palette" as Name, keys: "color.secondary color.ink" } });

/** `<ab-palette keys="color.*">`. */
export const Palette = meta.story({
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("ab-palette .ab-palette li")).not.toBeNull());
    await expect(customElements.get("ab-palette")).toBeDefined();
  },
});

/** `<ab-type keys="type.*">`. */
export const Type = meta.story({ args: { name: "ab-type" as Name, keys: "type.*" } });

/** `<ab-logos keys="logo.*">`. */
export const Logos = meta.story({
  args: { name: "ab-logos" as Name, keys: "logo.*" },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByRole("img").length).toBeGreaterThan(0));
  },
});

/** `<ab-rules keys="brand.* tone.*">`. */
export const Rules = meta.story({ args: { name: "ab-rules" as Name, keys: "brand.* tone.* copy.*" } });

/** `<ab-rule key="color.primary">`: one rule's value, inline. */
export const OneRule = meta.story({
  args: { name: "ab-rule" as Name, rule: "color.primary", keys: undefined },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText("#e87d0d")).toBeInTheDocument());
  },
});

/** `define()` registers them once: calling it again is harmless. */
export const Define = meta.story({
  render: () => {
    define();
    define();
    return <p className="text-sm">ab-palette, ab-type, ab-logos, ab-rules and ab-rule are registered.</p>;
  },
  play: async () => {
    for (const n of ["ab-palette", "ab-type", "ab-logos", "ab-rules", "ab-rule"]) await expect(customElements.get(n)).toBeDefined();
  },
});
