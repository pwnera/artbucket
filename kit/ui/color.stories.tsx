import preview from "../../.storybook/preview";
import { expect } from "storybook/test";
import { contrast, grade, hexOf, hsl, inkOn, isHex, luminance, mix, rgb, tintOf, toCmyk } from "./color.js";
import { colorValues, kebab, PRINT, SCREEN, swatchInk } from "./swatch.js";

/** Calls and what they return. */
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

/** A chip of a color, its hex on it in the ink that reads. */
const Chip = ({ hex }: { hex: string }) => (
  <span className="inline-flex h-10 w-24 items-end rounded-md p-1.5 font-mono text-xs" style={{ background: hex, color: inkOn(hex) }}>
    {hex}
  </span>
);

const ORANGE = "#e87d0d";

/**
 * `@artbucket/ui/color` and `@artbucket/ui/swatch`: the color math a palette needs, the same the Artbucket app
 * draws its palettes with (contrast, grades, tints, CMYK), and what a palette says about a color: its values for
 * screen and print, and the text set on it with how well that reads (WCAG 2). Pure, no DOM. MIT.
 *
 * ```js
 * import { contrast, grade } from "@artbucket/ui/color";
 * import { colorValues, swatchInk } from "@artbucket/ui/swatch";
 * ```
 */
const meta = preview.meta({ title: "Kit/Color", render: () => <></> });

/** `isHex(v)`: "#6d4aff" or "#6d4aff80", as a color rule stores it. */
export const IsHex = meta.story({
  render: () => <Calls rows={[[`isHex("#6d4aff")`, isHex("#6d4aff")], [`isHex("#6d4aff80")`, isHex("#6d4aff80")], [`isHex("6d4aff")`, isHex("6d4aff")]]} />,
  play: async () => {
    await expect(isHex("#6d4aff80")).toBe(true);
    await expect(isHex("6d4aff")).toBe(false);
  },
});

/** `hexOf(typed)`: "6D4AFF", "#abc" and "#6d4aff" are one color, saved as the last; null when it isn't a hex at all. */
export const HexOf = meta.story({
  render: () => <Calls rows={[[`hexOf("6D4AFF")`, hexOf("6D4AFF")], [`hexOf("#abc")`, hexOf("#abc")], [`hexOf("orange")`, hexOf("orange")]]} />,
  play: async () => {
    await expect(hexOf("#abc")).toBe("#aabbcc");
    await expect(hexOf("orange")).toBeNull();
  },
});

/** `rgb(hex)` and `hsl(rgb)`: channels, alpha ignored. */
export const RgbAndHsl = meta.story({
  render: () => <Calls rows={[[`rgb("${ORANGE}")`, rgb(ORANGE)], [`hsl(rgb("${ORANGE}"))`, hsl(rgb(ORANGE))]]} />,
  play: async () => {
    await expect(rgb("#34a853ff")).toEqual([52, 168, 83]);
  },
});

/** `luminance(rgb)`: WCAG 2 relative luminance, 0 to 1. */
export const Luminance = meta.story({
  render: () => <Calls rows={[[`luminance([255, 255, 255])`, luminance([255, 255, 255])], [`luminance(rgb("${ORANGE}"))`, luminance(rgb(ORANGE))]]} />,
  play: async () => {
    await expect(luminance([0, 0, 0])).toBe(0);
  },
});

/** `contrast(a, b)` and `grade(ratio)`: the ratio, 1 to 21, and what it allows for text (AAA 7, AA 4.5, AA large 3). */
export const ContrastAndGrade = meta.story({
  render: () => (
    <Calls
      rows={[
        [`contrast("#ffffff", "${ORANGE}")`, contrast("#ffffff", ORANGE)],
        [`grade(contrast("#ffffff", "${ORANGE}"))`, grade(contrast("#ffffff", ORANGE))],
        [`grade(21)`, grade(21)],
      ]}
    />
  ),
  play: async () => {
    await expect(contrast("#ffffff", "#000000")).toBe(21);
    await expect(grade(4.5)).toBe("AA");
    await expect(grade(2.8)).toBe("fail");
  },
});

/** `inkOn(hex)`: black or white, whichever reads better on the color. */
export const InkOn = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[ORANGE, "#265787", "#ffd400", "#1d1d1d"].map((h) => (
        <Chip key={h} hex={h} />
      ))}
    </div>
  ),
  play: async () => {
    await expect(inkOn(ORANGE)).toBe("#000000");
    await expect(inkOn("#265787")).toBe("#ffffff");
  },
});

/** `mix(a, b, t)` and `tintOf(color, pct)`: a step between two colors, and a print tint (tintOf(c, 80) is 80% ink). */
export const MixAndTints = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[100, 80, 60, 40, 20].map((t) => (
        <Chip key={t} hex={tintOf(ORANGE, t)} />
      ))}
      <Chip hex={mix(ORANGE, "#265787", 0.5)} />
    </div>
  ),
  play: async () => {
    await expect(tintOf(ORANGE, 100)).toBe(ORANGE);
    await expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  },
});

/** `toCmyk(color)`: CMYK in whole percents, converted naively (no ICC profile): a printer should get the book's own. */
export const ToCmyk = meta.story({
  render: () => <Calls rows={[[`toCmyk("${ORANGE}")`, toCmyk(ORANGE)], [`toCmyk("#000000")`, toCmyk("#000000")]]} />,
  play: async () => {
    await expect(toCmyk("#000000")).toEqual([0, 0, 0, 100]);
  },
});

/** `SCREEN`, `PRINT` and `kebab(key)`: the values a palette shows, in order, and a key as a CSS custom property's name. */
export const ValuesAndKebab = meta.story({
  render: () => <Calls rows={[["SCREEN", SCREEN], ["PRINT", PRINT], [`kebab("color.primaryDark")`, kebab("color.primaryDark")]]} />,
  play: async () => {
    await expect(kebab("color.primaryDark")).toBe("color-primary-dark");
  },
});

/** `colorValues(rule, show)`: the values asked for that the color has; print values the book didn't give are converted, and say so. */
export const ColorValues = meta.story({
  render: () => {
    const rows = colorValues({ key: "color.primary", value: ORANGE, spec: { pantone: ["716 C"], token: "Orange" } });
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
        {rows.map((r) => (
          <div key={r.label + r.text} className="contents">
            <dt className="font-medium">{r.label}</dt>
            <dd className="font-mono">
              {r.text}
              {r.converted && " (converted)"}
            </dd>
          </div>
        ))}
      </dl>
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("var(--color-primary)")).toBeInTheDocument();
    await expect(canvas.getByText(/\(converted\)/)).toBeInTheDocument();
  },
});

/** `swatchInk(rule, rules)`: the text set on a color, the color its spec pairs with it or black or white, with its ratio and grade. */
export const SwatchInk = meta.story({
  render: () => {
    const rules = [
      { key: "color.primary", type: "color", value: ORANGE, spec: { pair: "color.background" } },
      { key: "color.background", type: "color", value: "#ffffff" },
      { key: "color.secondary", type: "color", value: "#265787" },
    ];
    return <Calls rows={rules.slice(0, 1).concat(rules.slice(2)).map((r) => [`swatchInk(${r.key})`, swatchInk(r, rules)])} />;
  },
  play: async () => {
    const paired = swatchInk({ key: "a", type: "color", value: ORANGE, spec: { pair: "b" } }, [{ key: "b", type: "color", value: "#ffffff" }]);
    await expect(paired.ink).toBe("#ffffff");
    await expect(paired.grade).toBe("fail");
  },
});
