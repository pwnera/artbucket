"use client";

import { IconArrowBackUp, IconArrowForwardUp, IconCode, IconEye, IconEyeOff, IconHistory, IconListDetails, IconPalette, IconWorldUpload } from "@tabler/icons-react";
import { call, curl, ForAgents } from "@/components/agent-access";
import { IconButton } from "@/components/icon-button";
import { PageTree } from "@/components/builder/page-tree";
import type { BuilderApi, Panel } from "@/components/builder/use-builder";
import { SaveStatus } from "@/components/save-status";
import { tokensPath } from "@/components/tokens-dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { contextLabel } from "@/lib/rules";

/**
 * The bar over the canvas (build spec 3.5.3, W6.3): the page tabs
 * (PageTree), add page, undo and redo (b.undo, b.redo, b.canUndo,
 * b.canRedo), the context switch (b.setContext) and the language switch
 * (b.setLang, from b.view.theme.settings.languages), Theme, Rules and
 * History and Tokens (b.setPanel), For agents, Preview (b.setPreview),
 * Publish (b.setPanel "publish"), and SaveStatus.
 *
 * The context switch only sets b.state.context: the canvas's site resolves
 * each bound rule for it (lib/rules.ts resolve, through useRule), with no
 * fetch. In preview the bar steps aside for one Exit preview button, so keep
 * it mounted then too. Its keys (Cmd+Z, P, H, T, Esc) are the builder's; the
 * bar only names them. Tools are icons with their name in a tooltip: the bar
 * holds many, and the page tabs get the room. Publish alone keeps its word.
 *
 * Props:
 * - b: the builder.
 */
export type TopBarProps = {
  b: BuilderApi;
};

const DEFAULT = "*";

export function TopBar({ b }: TopBarProps) {
  if (b.state.preview)
    return (
      <Button variant="secondary" size="sm" className="app-tokens fixed end-4 bottom-4 z-40 shadow-lg" onClick={() => b.setPreview(false)}>
        <IconEyeOff /> Exit preview <Kbd keys={["Esc"]} />
      </Button>
    );

  const languages = b.view.theme.settings.languages ?? [];
  const contexts = b.view.contexts;
  const panel = (p: Panel, label: string, icon: React.ReactNode, keys?: string[]) => (
    <IconButton variant="ghost" label={label} shortcut={keys} aria-haspopup="dialog" onClick={() => b.setPanel(p)}>
      {icon}
    </IconButton>
  );
  const context = b.state.context ?? undefined;

  return (
    <header className="app-tokens bg-background text-foreground @container/bar sticky top-0 z-30 flex h-12 items-center gap-2 border-b px-3">
      <PageTree b={b} />

      <div className="flex shrink-0 items-center gap-1">
        <SaveStatus className="me-1" />
        <IconButton variant="ghost" label="Undo" shortcut={["mod", "Z"]} disabled={!b.canUndo} onClick={b.undo}>
          <IconArrowBackUp />
        </IconButton>
        <IconButton variant="ghost" label="Redo" shortcut={["mod", "⇧", "Z"]} disabled={!b.canRedo} onClick={b.redo}>
          <IconArrowForwardUp />
        </IconButton>

        {contexts.length > 0 && (
          <Select value={b.state.context ?? DEFAULT} onValueChange={(c) => b.setContext(c === DEFAULT ? null : c)}>
            <SelectTrigger size="sm" aria-label="Show the rules for a context" className="max-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="app-tokens">
              <SelectItem value={DEFAULT}>Default</SelectItem>
              {contexts.map((c) => (
                <SelectItem key={c} value={c}>
                  {contextLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {languages.length > 1 && (
          // The first language is the one the pages are written in: null shows them as written.
          <Select value={b.state.lang ?? languages[0].code} onValueChange={(l) => b.setLang(l === languages[0].code ? null : l)}>
            <SelectTrigger size="sm" aria-label="Show the pages in a language" className="max-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="app-tokens">
              {languages.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {panel("theme", "Theme", <IconPalette />)}
        {panel("rules", "Rules", <IconListDetails />)}
        {panel("history", "History", <IconHistory />, ["H"])}
        {panel("tokens", "Design tokens", <IconCode />, ["T"])}
        <ForAgents
          about={`These rules as data, in this order${context ? `, resolved for ${contextLabel(context)}` : ", every variant included"}. Agents read them before making anything on-brand.`}
          reads={brandReads(b.view.brand.slug, context)}
        />
        <IconButton variant="ghost" label="Preview as readers see it" shortcut={["P"]} onClick={() => b.setPreview(true)}>
          <IconEye />
        </IconButton>
        <Button size="sm" aria-haspopup="dialog" onClick={() => b.setPanel("publish")}>
          <IconWorldUpload /> Publish
        </Button>
      </div>
    </header>
  );
}

/** How an agent reads these rules: the same rules, in the same order, resolved for the context shown. */
function brandReads(brand: string, context?: string) {
  return (origin: string) => {
    const q = new URLSearchParams({ brand, ...(context && { context }) });
    return [
      { label: "MCP tool", text: call("brand_rules", { brand, context }) },
      { label: "MCP resource", text: `artbucket://brands/${brand}/rules${context ? `/${context}` : ""}` },
      { label: "REST", text: curl(`${origin}/api/v1/brand/rules?${q}`) },
      { label: "Design tokens", text: curl(`${origin}${tokensPath({ slug: brand, name: brand }, context, "json")}`) },
    ];
  };
}
