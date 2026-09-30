"use client";

import {
  IconAdjustmentsHorizontal,
  IconArrowBackUp,
  IconArrowDown,
  IconArrowForwardUp,
  IconArrowUp,
  IconCode,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconFocusCentered,
  IconGitCompare,
  IconHistory,
  IconLayoutSidebarLeftExpand,
  IconListDetails,
  IconMessageCircle,
  IconPalette,
  IconPhoto,
  IconPictureInPictureOn,
  IconTrash,
  IconWorldUpload,
} from "@tabler/icons-react";
import type { PageCommand } from "@/components/command-palette";
import { reveal } from "@/components/builder/layers";
import { choiceLabel, GROUNDS, templateOptions, variantOf, WIDTHS } from "@/components/builder/section-toolbar";
import { starter } from "@/components/builder/seam";
import { Thumbnail } from "@/components/builder/thumbnails";
import type { BuilderApi } from "@/components/builder/use-builder";
import { TEMPLATE_INFO, TEMPLATES } from "@/lib/pages";
import { ruleName } from "@/lib/rules";
import { withProp } from "@/lib/template-fields";

/**
 * The builder's part of ⌘K (command-palette.tsx PageCommand), read from the
 * builder as it is when the palette opens: what the picked section can do
 * (duplicate, hide, delete, move, its template, variant, ground and width),
 * a block of every template to insert after it, each section on the page and
 * each rule it shows to go to, and the builder's own panels and modes. With
 * nothing typed only the few marked `top` show.
 */
export function builderCommands(b: BuilderApi): PageCommand[] {
  const page = b.state.selection.page;
  const list = b.state.pages.get(page) ?? [];
  const id = b.state.selection.section;
  const s = id ? list.find((x) => x.id === id) : undefined;
  const at = s ? list.indexOf(s) : -1;
  const set = (patch: Record<string, unknown>) => s && b.apply({ kind: "page", page, op: { op: "update", id: s.id, set: patch } });
  const out: PageCommand[] = [];
  const name = s ? s.title || TEMPLATE_INFO[s.template].name : "";
  const editing = !b.state.preview;

  if (s && editing) {
    const g = `Section: ${name}`;
    out.push(
      { id: "s-dup", group: g, label: "Duplicate", icon: <IconCopy />, shortcut: ["mod", "D"], top: true, run: () => b.duplicate(s.id) },
      { id: "s-hide", group: g, label: s.hidden ? "Show to readers" : "Hide from readers", icon: s.hidden ? <IconEye /> : <IconEyeOff />, top: true, run: () => set({ hidden: !s.hidden }) },
      { id: "s-settings", group: g, label: "Section settings", icon: <IconAdjustmentsHorizontal />, top: true, run: () => b.setDock("section") },
      { id: "s-del", group: g, label: "Delete", icon: <IconTrash />, shortcut: ["⌫"], top: true, run: () => b.removeSection(s.id) },
    );
    if (at > 0) out.push({ id: "s-up", group: g, label: "Move up", icon: <IconArrowUp />, shortcut: ["⌥", "↑"], run: () => b.nudge(s.id, -1) });
    if (at >= 0 && at < list.length - 1) out.push({ id: "s-down", group: g, label: "Move down", icon: <IconArrowDown />, shortcut: ["⌥", "↓"], run: () => b.nudge(s.id, 1) });
    for (const o of templateOptions(b, s)) {
      if (!o.set) continue;
      const patch = o.set;
      out.push({ id: `s-t-${o.t}`, group: g, label: `Switch to ${TEMPLATE_INFO[o.t].name}`, icon: <Thumbnail template={o.t} className="h-4 w-5" />, keywords: ["template"], run: () => set(patch) });
    }
    const v = variantOf(s.template);
    if (v)
      for (const o of v.options)
        out.push({ id: `s-v-${o}`, group: g, label: `${v.label}: ${choiceLabel(o)}`, keywords: ["layout", "variant"], run: () => set({ props: withProp(s.props, v, o) }) });
    for (const [tone, label] of GROUNDS.filter(([t]) => t !== "pattern" || b.view.theme.device))
      out.push({ id: `s-g-${tone}`, group: g, label: `Ground: ${label}`, keywords: ["background", "tone", "color"], run: () => set({ tone, background: null }) });
    for (const [width, I, label] of WIDTHS) out.push({ id: `s-w-${width}`, group: g, label: `Width: ${label}`, icon: <I />, run: () => set({ width }) });
  }

  if (editing) {
    const after = s?.id ?? list.at(-1)?.id ?? null;
    const slugs = b.state.nav.map((p) => p.slug);
    for (const t of TEMPLATES)
      out.push({
        id: `add-${t}`,
        group: "Insert",
        label: `Insert ${TEMPLATE_INFO[t].name}${s ? " below" : ""}`,
        icon: <Thumbnail template={t} className="h-4 w-5" />,
        keywords: ["add", "block", "new", TEMPLATE_INFO[t].use],
        run: () => {
          const made = b.insert(starter(t, b.state.rules, b.view.brand.name, slugs, s?.tab), after);
          if (made) requestAnimationFrame(() => reveal(made));
        },
      });
  }

  for (const x of list)
    out.push({
      id: `go-${x.id}`,
      group: "On this page",
      label: x.title || TEMPLATE_INFO[x.template].name,
      icon: <IconFocusCentered />,
      keywords: ["go", "section", TEMPLATE_INFO[x.template].name],
      run: () => {
        b.pick(x.id);
        requestAnimationFrame(() => reveal(x.id));
      },
    });
  const shown = new Set(list.flatMap((x) => x.keys));
  for (const r of b.state.rules)
    if (r.context === null && shown.has(r.key))
      out.push({
        id: `rule-${r.key}`,
        group: "On this page",
        label: `Rule: ${ruleName(r)}`,
        icon: r.type === "color" ? <span className="size-4 shrink-0 rounded-sm border" style={{ background: String(r.value).slice(0, 7) }} /> : <IconPhoto />,
        keywords: [r.key, "rule"],
        run: () => {
          const x = list.find((y) => y.keys.includes(r.key));
          if (!x) return;
          b.pick(x.id);
          requestAnimationFrame(() => reveal(x.id));
        },
      });

  const g = "Builder";
  out.push(
    { id: "b-undo", group: g, label: "Undo", icon: <IconArrowBackUp />, shortcut: ["mod", "Z"], run: b.undo },
    { id: "b-redo", group: g, label: "Redo", icon: <IconArrowForwardUp />, shortcut: ["mod", "⇧", "Z"], run: b.redo },
    { id: "b-preview", group: g, label: b.state.preview ? "Leave the preview" : "Preview the whole site", icon: <IconEye />, shortcut: ["P"], top: true, run: () => b.setPreview(!b.state.preview) },
    {
      id: "b-theme",
      group: g,
      label: "Theme",
      icon: <IconPalette />,
      keywords: ["colors", "fonts", "look", "nav"],
      top: true,
      run: () => {
        b.setDock("theme");
        b.setPreview(true);
      },
    },
    { id: "b-rules", group: g, label: "Rules", icon: <IconListDetails />, run: () => b.setPanel("rules") },
    { id: "b-library", group: g, label: b.library ? "Close the library" : "Library: drag assets onto the page", icon: <IconPhoto />, keywords: ["assets", "pictures", "images"], top: true, run: () => b.setLibrary(!b.library) },
    { id: "b-add", group: g, label: "Add panel: blocks and rules", icon: <IconAdjustmentsHorizontal />, run: () => b.setDock("insert") },
    { id: "b-pages", group: g, label: b.pagesOpen ? "Hide pages and layers" : "Show pages and layers", icon: <IconLayoutSidebarLeftExpand />, run: () => b.setPagesOpen(!b.pagesOpen) },
    { id: "b-float", group: g, label: b.floating ? "Dock the panel beside the page" : "Float the panel over the page", icon: <IconPictureInPictureOn />, run: () => b.setFloating(!b.floating) },
    { id: "b-history", group: g, label: "History", icon: <IconHistory />, shortcut: ["H"], run: () => b.setPanel("history") },
    { id: "b-tokens", group: g, label: "Design tokens", icon: <IconCode />, shortcut: ["T"], run: () => b.setPanel("tokens") },
    {
      id: "b-comments",
      group: g,
      label: b.comments.openCount ? `Comments (${b.comments.openCount} open)` : "Comments",
      icon: <IconMessageCircle />,
      keywords: ["review", "feedback", "threads"],
      top: b.comments.openCount > 0,
      run: () => {
        b.setCommentsOnPage(!b.state.selection.section);
        b.setDock("comments");
      },
    },
    { id: "b-changes", group: g, label: b.changes ? "Stop marking changes" : "Mark what changed since the last release", icon: <IconGitCompare />, keywords: ["diff", "compare", "review"], run: () => b.setChanges(!b.changes) },
    { id: "b-publish", group: g, label: "Release", icon: <IconWorldUpload />, top: true, run: () => b.setPanel("publish") },
  );
  return out;
}
