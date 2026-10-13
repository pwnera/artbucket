import type { DoDontItem, Options, Rule } from "./html.js";
type Drawn<P> = (props: P & { className?: string }) => unknown;
export declare const Palette: Drawn<Options & { rules: Rule[] }>;
export declare const TypeSpecimen: Drawn<Options & { rules: Rule[]; sample?: string }>;
export declare const LogoGrid: Drawn<Options & { rules: Rule[] }>;
export declare const DoDont: Drawn<{ items: DoDontItem[] }>;
export declare const RuleList: Drawn<Options & { rules: Rule[] }>;
export declare function RuleValue(props: { rule: Rule | undefined; src?: Options["src"] }): unknown;
