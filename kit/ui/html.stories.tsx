import preview from "../../.storybook/preview";
import { expect } from "storybook/test";
import { fixtureUrl, fixtureView } from "@/lib/fixtures/brand-book";
import { asks, cssFamily, doDont, esc, familyOf, imageOf, logoGrid, palette, type Rule, ruleList, ruleValue, textOf, typeSpecimen } from "./html.js";
import "./ui.css";

/** The Blender fixture book's rules, its files drawn as placeholders: no network. */
const RULES: Rule[] = fixtureView("blender").rules;
const src = (a: { id: string }) => fixtureUrl(a.id);
const rule = (key: string) => RULES.find((r) => r.key === key && !r.context)!;

/** A drawing as a page gets it: the string, set as HTML. */
const Html = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />;

/** Calls and what they return, for the helpers that draw nothing. */
function Calls({ rows }: { rows: [call: string, result: unknown][] }) {
  return (
    <table className="text-sm">
      <thead>
        <tr>
          <th scope="col" className="pe-6 text-start font-medium">
            Call
          </th>
          <th scope="col" className="text-start font-medium">
            Returns
          </th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map(([call, result]) => (
          <tr key={call}>
            <td className="pe-6 align-top">{call}</td>
            <td className="break-all">{JSON.stringify(result)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * `@artbucket/ui/html`: draw a brand's rules from an Artbucket release (the palette with contrast, the type
 * specimen, logos, dos and don'ts, any rule's value) as HTML strings, for any framework, at build time or in the
 * browser. MIT.
 *
 * ```js
 * import { palette, logoGrid } from "@artbucket/ui/html"; // strings
 * ```
 *
 * Style: `@artbucket/ui/ui.css`. Docs: https://docs.artbucket.io/developers/kit. Here from the Blender fixture book.
 */
const meta = preview.meta({ title: "Kit/HTML", render: () => <></> });

/** `palette(rules, { keys, context })`: each color a chip with the text the brand sets on it, its values for screen and print, and how it reads on white and black. */
export const Palette = meta.story({
  render: () => <Html html={palette(RULES, { keys: ["color.*"] })} />,
  // Blender's own pairs on its chips (white on orange): the brand's colors, graded beside them.
  parameters: { a11y: { context: { exclude: [".ab-chip"] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("#e87d0d").length).toBeGreaterThan(0);
  },
});

/** `palette(rules, { context })`: a context's values, here the dark background's. */
export const PaletteInAContext = meta.story({
  render: () => <Html html={palette(RULES, { keys: ["color.background"], context: "dark-background" })} />,
  parameters: { a11y: { context: { exclude: [".ab-chip"] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("#1d1d1d")).toBeInTheDocument();
  },
});

/** `typeSpecimen(rules, { keys, sample })`: the faces, each set in itself. */
export const TypeSpecimen = meta.story({ render: () => <Html html={typeSpecimen(RULES, { keys: ["type.*"], sample: "The freedom to create." })} /> });

/** `logoGrid(rules, { keys, src })`: every rule with an image, on its own tile; `src(asset)` says where its file is. */
export const LogoGrid = meta.story({
  render: () => <Html html={logoGrid(RULES, { keys: ["logo.*"], src })} />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("img").length).toBeGreaterThan(0);
  },
});

/** `doDont(items)`: dos and don'ts, `{ verdict, title?, text?, image? }`, an image by its URL. */
export const DoDont = meta.story({
  render: () => (
    <Html
      html={doDont([
        { verdict: "do", title: "Room", text: "Give the logo room: a clear space of the circle's height." },
        { verdict: "dont", title: "Recolor", text: "Recolor the mark.", image: fixtureUrl("00000000-0000-4000-8000-000000000001"), caption: "The mark in green" },
      ])}
    />
  ),
});

/** `ruleList(rules, { keys })`: the rules that are neither colors, faces nor images, as a list of terms. */
export const RuleList = meta.story({ render: () => <Html html={ruleList(RULES, { keys: ["brand.*", "tone.*", "copy.*"] })} /> });

/** `ruleValue(rule, { src })`: one rule's value, inline: a color's chip and hex, a face set in itself, an image, or its words. */
export const RuleValue = meta.story({
  render: () => (
    <p className="flex flex-wrap items-center gap-6">
      {["color.primary", "type.heading", "brand.mission"].map((k) => (
        <Html key={k} html={ruleValue(rule(k), { src })} />
      ))}
    </p>
  ),
});

/** `esc(s)`: text made safe for HTML, in an element or an attribute. */
export const Esc = meta.story({
  render: () => <Calls rows={[[`esc('<b class="x">Acme & co</b>')`, esc('<b class="x">Acme & co</b>')]]} />,
  play: async () => {
    await expect(esc("<a>")).toBe("&#60;a&#62;");
  },
});

/** `asks(key, keys)`: whether a list asks for a key: the key, `color.*` for a group, `*` for every one. */
export const Asks = meta.story({
  render: () => (
    <Calls
      rows={[
        [`asks("color.primary", ["color.*"])`, asks("color.primary", ["color.*"])],
        [`asks("type.body", ["color.*"])`, asks("type.body", ["color.*"])],
        [`asks("logo.mark")`, asks("logo.mark")],
      ]}
    />
  ),
  play: async () => {
    await expect(asks("color.primary", ["color.*"])).toBe(true);
    await expect(asks("type.body", ["color.*"])).toBe(false);
  },
});

/** `imageOf(rule)`: the first image among a rule's files. */
export const ImageOf = meta.story({
  render: () => <Calls rows={[[`imageOf(rule("logo.mark"))`, imageOf(rule("logo.mark"))]]} />,
  play: async () => {
    await expect(imageOf(rule("logo.mark"))?.mime).toMatch(/^image\//);
  },
});

/** `familyOf(rule)` and `cssFamily(rule)`: a font rule's family, and as a CSS string, quoted so a name can't end the declaration. */
export const FamilyOf = meta.story({
  render: () => (
    <Calls
      rows={[
        [`familyOf(rule("type.heading"))`, familyOf(rule("type.heading"))],
        [`cssFamily({ value: 'Evil"; x' })`, cssFamily({ key: "type.x", type: "font", value: 'Evil"; x' })],
      ]}
    />
  ),
  play: async () => {
    await expect(familyOf(rule("type.heading"))).toBe("Inter");
  },
});

/** `textOf(rule)`: a rule's value as words: a list joined, a font by its family. */
export const TextOf = meta.story({
  render: () => (
    <Calls
      rows={[
        [`textOf(rule("type.heading"))`, textOf(rule("type.heading"))],
        [`textOf({ value: ["Plain", "Warm"] })`, textOf({ key: "tone.words", type: "list", value: ["Plain", "Warm"] })],
      ]}
    />
  ),
  play: async () => {
    await expect(textOf({ key: "tone.words", type: "list", value: ["Plain", "Warm"] })).toBe("Plain, Warm");
  },
});
