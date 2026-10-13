// @artbucket/ui for React: the same drawings as components, rendered on the server or in the browser.
//   <Palette rules={brand.rules} keys={["color.*"]} />
// MIT License, see LICENSE.
import { createElement } from "react";
import { doDont, logoGrid, palette, ruleList, ruleValue, typeSpecimen } from "./html.js";

const drawn = (draw) =>
  function Drawn({ className, ...o }) {
    return createElement("div", { className: className ? `ab ${className}` : "ab", dangerouslySetInnerHTML: { __html: draw(o) } });
  };

export const Palette = drawn(({ rules, ...o }) => palette(rules, o));
export const TypeSpecimen = drawn(({ rules, ...o }) => typeSpecimen(rules, o));
export const LogoGrid = drawn(({ rules, ...o }) => logoGrid(rules, o));
export const DoDont = drawn(({ items }) => doDont(items));
export const RuleList = drawn(({ rules, ...o }) => ruleList(rules, o));
export function RuleValue({ rule, src }) {
  return createElement("span", { dangerouslySetInnerHTML: { __html: ruleValue(rule, { src }) } });
}
