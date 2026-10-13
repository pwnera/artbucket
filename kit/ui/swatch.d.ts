import type { Rule } from "./html.js";
export type Value = "hex" | "rgb" | "hsl" | "token" | "css" | "cmyk" | "pantone" | "ral";
export declare const SCREEN: Value[];
export declare const PRINT: Value[];
export declare const kebab: (key: string) => string;
export type ValueRow = { label: string; text: string; converted?: boolean };
export declare function colorValues(rule: Pick<Rule, "key" | "value"> & { spec?: unknown }, show?: Value[]): ValueRow[];
export declare function swatchInk<R extends Pick<Rule, "key" | "type" | "value"> & { spec?: unknown }>(
  rule: R,
  rules?: R[],
): { ink: string; partner: R | null; ratio: number; grade: "AAA" | "AA" | "AA large" | "fail" };
