// @artbucket/ui as web components, for any framework or none:
//   <ab-palette src="/brand.json" keys="color.*"></ab-palette>
//   <ab-type>, <ab-logos>, <ab-rules>, <ab-rule key="color.primary">
// `src` is a brand.json as `artbucket brand export` writes it (its files beside it), fetched once;
// or set the `rules` property. They draw into their own children, so the page's CSS reaches them.
// MIT License, see LICENSE.
import { logoGrid, palette, ruleList, ruleValue, typeSpecimen } from "./html.js";

const loaded = new Map();
const load = (src) => {
  if (!loaded.has(src)) loaded.set(src, fetch(src).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${src}: ${r.status}`)))));
  return loaded.get(src);
};

const DRAW = {
  "ab-palette": (rules, o) => palette(rules, o),
  "ab-type": (rules, o) => typeSpecimen(rules, o),
  "ab-logos": (rules, o) => logoGrid(rules, o),
  "ab-rules": (rules, o) => ruleList(rules, o),
  "ab-rule": (rules, o, el) => ruleValue(rules.find((r) => r.key === el.getAttribute("key") && (r.context ?? null) === o.context), o),
};

/** Registers the elements, once; nothing where there is no DOM (a server render). */
export function define() {
  if (typeof customElements === "undefined") return;
  for (const [name, draw] of Object.entries(DRAW)) {
    if (customElements.get(name)) continue;
    customElements.define(
      name,
      class extends HTMLElement {
        static observedAttributes = ["src", "keys", "context"];
        #rules = null;
        #base = "/";
        set rules(v) {
          this.#rules = v;
          this.#draw();
        }
        get rules() {
          return this.#rules;
        }
        connectedCallback() {
          void this.#draw();
        }
        attributeChangedCallback() {
          if (this.isConnected) void this.#draw();
        }
        async #draw() {
          let rules = this.#rules;
          if (!rules) {
            const src = this.getAttribute("src") ?? "/brand.json";
            const brand = await load(src).catch(() => null);
            if (!brand) return;
            rules = brand.rules;
            // An export's files sit beside its brand.json.
            this.#base = new URL(".", new URL(src, location.href)).pathname;
          }
          const keys = this.getAttribute("keys")?.split(/[\s,]+/).filter(Boolean);
          const context = this.getAttribute("context") || null;
          this.innerHTML = draw(rules, { keys, context, src: (a) => (a.file ? `${this.#base}${a.file}` : "") }, this);
        }
      },
    );
  }
}
