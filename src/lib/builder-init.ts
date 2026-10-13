import type { NavEntry } from "@/lib/builder-ops";
import type { Rule } from "@/lib/rules";
import { get, getBody } from "@/lib/sidebar";
import type { PageView, ViewRule } from "@/lib/site";

/**
 * A rule as the builder holds it, from GET /brand/rules: described as the
 * page's view describes it when the page shows it, else from the rule's own
 * asset rows. ponytail: those carry no size, so a file list off the first
 * page reads 0 B until builder-ops load() takes rules from each view.
 */
function viewRule(r: Rule, shown: Map<string, ViewRule>): ViewRule {
  return (
    shown.get(`${r.key}@${r.context ?? ""}`) ?? {
      key: r.key,
      context: r.context,
      type: r.type,
      label: r.label ?? null,
      value: r.value,
      usage: r.usage,
      spec: r.spec ?? null,
      assets: r.assets.map((a) => ({
        ...a,
        title: a.title ?? null,
        filename: a.filename ?? "",
        mime: a.mime ?? "",
        size: 0,
        preview: !!a.preview,
        supersededBy: null,
      })),
    }
  );
}

/**
 * What the builder's state starts from (use-builder.ts), over HTTP like any
 * client: the pages, `page` as the editor sees it (the first page without
 * one), and every rule and version whatever the context, so switching one is
 * instant. The builder and the brand's Rules tab both start from it. `shown`
 * is null for a page that is gone; null altogether when the brand isn't there.
 */
export async function builderInit(slug: string, o: { page?: string; context?: string } = {}) {
  const b = encodeURIComponent(slug);
  const q = new URLSearchParams({ ...(o.page && { page: o.page }), ...(o.context && { context: o.context }), edit: "1" });
  const [pages, edit, rules] = await Promise.all([
    get(`brands/${b}/pages`, (x: { data: (NavEntry & { sections: number })[] }) => x.data, null),
    getBody<{ data?: PageView }>(`brands/${b}/view?${q}`),
    get(`brand/rules?brand=${b}`, (x: { data: Rule[] }) => x.data, null),
  ]);
  const shown = edit?.data ?? null;
  if (!pages || !rules) return null;
  if (!shown) return { pages, shown: null, init: null };
  const described = new Map(shown.rules.map((r) => [`${r.key}@${r.context ?? ""}`, r]));
  const init = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    nav: pages.map(({ sections: _, ...p }) => p),
    view: shown,
    rules: rules.map((r) => viewRule(r, described)),
    theme: shown.theme.settings,
  };
  return { pages, shown, init };
}
