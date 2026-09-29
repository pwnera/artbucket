"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconBlockquote,
  IconBold,
  IconCode,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconPilcrow,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconSeparator,
  IconSourceCode,
  IconStrikethrough,
  IconTable,
  IconTableOff,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { Extension, getMarkAttributes, type ChainedCommands } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import Suggestion, { exitSuggestion, type SuggestionProps } from "@tiptap/suggestion";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/asset-picker";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { linkHref, renderMarkdown, safeUrl } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/** A block "/" can add: its Markdown shortcut is shown beside it, so the menu teaches the faster way. */
type Block = {
  label: string;
  hint: string;
  icon: Icon;
  md?: string;
  aliases: string[];
  /** Absent for the image, which asks the library first. */
  run?: (c: ChainedCommands) => ChainedCommands;
};

const BLOCKS: Block[] = [
  { label: "Text", hint: "A plain paragraph", icon: IconPilcrow, aliases: ["paragraph", "plain"], run: (c) => c.setParagraph() },
  { label: "Heading", hint: "Starts a part of the text", icon: IconH2, md: "##", aliases: ["h2", "title"], run: (c) => c.setHeading({ level: 2 }) },
  { label: "Subheading", hint: "A smaller heading", icon: IconH3, md: "###", aliases: ["h3"], run: (c) => c.setHeading({ level: 3 }) },
  { label: "Bulleted list", hint: "Points in any order", icon: IconList, md: "-", aliases: ["ul", "bullets", "unordered"], run: (c) => c.toggleBulletList() },
  { label: "Numbered list", hint: "Steps in order", icon: IconListNumbers, md: "1.", aliases: ["ol", "ordered", "steps"], run: (c) => c.toggleOrderedList() },
  { label: "Quote", hint: "Words set apart", icon: IconBlockquote, md: ">", aliases: ["blockquote", "citation"], run: (c) => c.toggleBlockquote() },
  { label: "Code block", hint: "Monospace, as typed", icon: IconSourceCode, md: "```", aliases: ["pre", "snippet"], run: (c) => c.toggleCodeBlock() },
  { label: "Divider", hint: "A break between parts", icon: IconSeparator, md: "---", aliases: ["hr", "rule", "separator", "line"], run: (c) => c.setHorizontalRule() },
  { label: "Table", hint: "Rows and columns", icon: IconTable, aliases: ["grid"], run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { label: "Image", hint: "From the library", icon: IconPhoto, aliases: ["picture", "photo", "asset", "logo"] },
];

/** "/li" finds both lists: any word of the label, or an alias, starting with what was typed. */
const findBlocks = (query: string) => {
  const q = query.toLowerCase();
  return BLOCKS.filter((b) => [...b.label.toLowerCase().split(" "), ...b.aliases].some((w) => w.startsWith(q)));
};

const SLASH = new PluginKey("slash");

/**
 * Stored as "## " and "### ", drawn `by` levels down so they sit under the
 * heading above the text, as lib/markdown renders them for readers: two
 * under a rule's h3 name (h4, h5), one under a section's h2 title (h3, h4).
 * Pasting reads either back.
 */
const demoted = (by: number) =>
  Heading.configure({ levels: [2, 3] }).extend({
    renderHTML: ({ node, HTMLAttributes }) => [`h${node.attrs.level + by}`, HTMLAttributes, 0],
    parseHTML: () =>
      [2, 3].flatMap((level) => [
        { tag: `h${level}`, attrs: { level } },
        { tag: `h${level + by}`, attrs: { level } },
      ]),
  });

// The same for every editor, so they are built once.
const BASE = [
  // Underline has no Markdown, so it would not survive a save.
  StarterKit.configure({ underline: false, heading: false, link: { openOnClick: false, isAllowedUri: safeUrl } }),
  Markdown,
  TableKit.configure({ table: { resizable: false } }),
  Image,
];

type Slash = { items: Block[]; index: number; rect: DOMRect | null; run: (b: Block) => void };

/**
 * Markdown, edited like Notion: type "/" for blocks (headings, lists, a
 * quote, code, a divider, a table, an image from the library), select text
 * for a toolbar, or type the Markdown shortcuts (`## `, `- `, `> `, three
 * backticks, `---`). What it saves is the Markdown, so agents read exactly
 * what the page renders. Saves as you type, 800ms after the last key, and at
 * once when you leave it or the tab closes. Esc leaves it.
 */
export default function RichText({
  value,
  onSave,
  placeholder,
  label,
  className,
  style,
  required,
  onEmpty,
  demote = 2,
}: {
  value: string;
  onSave: (markdown: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  /** The text is the rule: cleared, it comes back as saved when you leave it, with onEmpty offered. */
  required?: boolean;
  /** Offered when a required text is cleared: a way to delete the rule instead. */
  onEmpty?: () => void;
  /** How many levels its headings drop, as lib/markdown's `demote`: 2 under a rule's name, 1 under a section's title. */
  demote?: number;
}) {
  const [picking, setPicking] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  const uid = useId();
  // What the rule holds, as far as this editor knows: a save goes out only when the text differs.
  const saved = useRef(value.trim());
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = (e: Editor) => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const md = e.getMarkdown().trim();
    if (md === saved.current || (required && !md)) return;
    saved.current = md;
    save.current(md);
  };
  // For the listeners below, which outlive the render that made them.
  const flushing = useRef(flush);
  useEffect(() => {
    flushing.current = flush;
  });

  // The menu's keys, as of the last render: the plugin that asks for them lives as long as the editor.
  const menuKey = useRef<(e: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    menuKey.current = (e) => {
      if (!slash?.items.length) return false;
      const n = slash.items.length;
      const at = Math.min(slash.index, n - 1);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setSlash({ ...slash, index: (at + (e.key === "ArrowDown" ? 1 : -1) + n) % n });
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        slash.run(slash.items[at]);
        return true;
      }
      // Esc: the plugin closes the menu.
      return e.key === "Escape";
    };
  });

  const extensions = useMemo(() => {
    const show = (p: SuggestionProps<Block, Block>) =>
      setSlash((s) => ({
        // Items come a tick after the query; the last ones stay up meanwhile, so the menu doesn't blink.
        items: p.loading ? (s?.items ?? BLOCKS) : p.items,
        index: p.loading ? (s?.index ?? 0) : 0,
        rect: p.clientRect?.() ?? null,
        run: p.command,
      }));
    return [
      ...BASE,
      demoted(demote),
      Placeholder.configure({
        placeholder: ({ editor }) => (editor.isEmpty ? (placeholder ?? "Write, or type / for blocks") : "Type / for blocks, ## for a heading"),
      }),
      Extension.create({
        name: "slash",
        // Ahead of the lists' and paragraphs' own Enter, so Enter picks from the menu.
        priority: 200,
        addProseMirrorPlugins() {
          return [
            Suggestion<Block, Block>({
              editor: this.editor,
              pluginKey: SLASH,
              char: "/",
              // In code, "/" is a slash.
              allow: ({ state }) => !state.selection.$from.parent.type.spec.code,
              items: ({ query }) => findBlocks(query),
              command: ({ editor, range, props: b }) => {
                const c = editor.chain().focus().deleteRange(range);
                if (b.run) b.run(c).run();
                else {
                  c.run();
                  setPicking(true);
                }
              },
              render: () => ({
                onStart: show,
                onUpdate: show,
                onExit: () => setSlash(null),
                onKeyDown: ({ event }) => menuKey.current(event),
              }),
            }),
          ];
        },
      }),
    ];
  }, [placeholder, demote]);

  const editorProps = useMemo(
    () => ({
      attributes: { class: cn("rich outline-none", className), ...(label ? { "aria-label": label } : {}) },
      handleKeyDown: (view: Editor["view"], e: KeyboardEvent) => {
        // ⌘K on a selection links it, as in Notion; with nothing selected it falls through to search.
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !view.state.selection.empty) {
          setLinking(getMarkAttributes(view.state, "link").href ?? "");
          return true;
        }
        // With the "/" menu open, Esc is the menu's.
        if (e.key !== "Escape" || SLASH.getState(view.state)?.active) return false;
        // On the page, Esc selects the block, as in Notion. Leaving saves.
        const block = view.dom.closest<HTMLElement>("[data-block]");
        if (block) block.focus();
        else view.dom.blur();
        return true;
      },
    }),
    [className, label],
  );

  // Only the first value: later ones arrive through the effect below, which knows not to overwrite typing.
  const [content] = useState(value);
  // It only ever renders on the client (loaded with ssr: false), so the text is there on the first paint.
  const editor = useEditor({
    immediatelyRender: true,
    extensions,
    content,
    contentType: "markdown",
    editorProps,
    onUpdate: ({ editor }) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(editor), 800);
    },
    onBlur: ({ editor }) => {
      exitSuggestion(editor.view, SLASH);
      // Leaving for the library isn't leaving: the image goes in the empty text.
      if (required && !picking && !editor.getMarkdown().trim()) {
        // Clearing the text doesn't clear the rule: it comes back, and deleting is offered instead.
        clearTimeout(timer.current);
        timer.current = undefined;
        editor.commands.setContent(saved.current, { contentType: "markdown", emitUpdate: false });
        toast("A text rule needs text", onEmpty ? { action: { label: "Delete rule", onClick: onEmpty } } : undefined);
        return;
      }
      flush(editor);
    },
  });

  // A save still waiting goes out when the tab closes (send's keepalive carries it) or the editor leaves the page.
  useEffect(() => {
    if (!editor) return;
    const out = () => timer.current !== undefined && flushing.current(editor);
    window.addEventListener("pagehide", out);
    return () => {
      window.removeEventListener("pagehide", out);
      out();
    };
  }, [editor]);

  // What the server saved comes back; take it unless you are mid-edit. A destroyed editor (strict mode
  // remounts it) is skipped: its replacement runs this again.
  useEffect(() => {
    saved.current = value.trim();
    if (editor && !editor.isDestroyed && !editor.isFocused &&editor.getMarkdown().trim() !== value.trim())
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  // The caret stays in the text while arrows move through the menu: the text points at the row.
  const open = !!slash?.items.length && !!slash.rect;
  const index = slash ? Math.min(slash.index, slash.items.length - 1) : 0;
  useEffect(() => {
    // Rendered before EditorContent mounts the view, and view warns when read then. The menu only opens once typing, so it's mounted by then.
    if (!editor?.isInitialized) return;
    const dom = editor.view.dom;
    if (open) {
      dom.setAttribute("aria-controls", `${uid}-slash`);
      dom.setAttribute("aria-activedescendant", `${uid}-slash-${index}`);
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    }
  }, [editor, open, index, uid]);

  if (!editor) return <div className={cn("rich", className)} style={style} dangerouslySetInnerHTML={{ __html: renderMarkdown(value, { demote }) }} />;
  return (
    <div className="relative" style={style}>
      <TextMenu editor={editor} linking={linking} setLinking={setLinking} />
      <TableBar editor={editor} />
      <EditorContent editor={editor} />
      {open && slash?.rect && <SlashMenu id={`${uid}-slash`} slash={slash} rect={slash.rect} index={index} onHover={(i) => setSlash({ ...slash, index: i })} />}
      {picking && (
        <LibraryPicker
          onClose={() => setPicking(false)}
          onPick={(a) => {
            setPicking(false);
            editor
              .chain()
              .focus()
              .setImage({ src: `${location.origin}/a/${a.id}/w_1600,f_webp`, alt: a.filename })
              .run();
          }}
        />
      )}
    </div>
  );
}

/** Notion's "/" menu, at the caret: below it, or above when the caret is near the bottom of the window. */
function SlashMenu({ id, slash, rect, index, onHover }: { id: string; slash: Slash; rect: DOMRect; index: number; onHover: (i: number) => void }) {
  const up = window.innerHeight - rect.bottom < 340;
  return createPortal(
    <div
      id={id}
      role="listbox"
      aria-label="Blocks"
      className="bg-popover text-popover-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 fixed z-50 max-h-80 w-72 overflow-y-auto rounded-lg border p-1 shadow-md duration-100"
      style={up ? { left: rect.left, bottom: window.innerHeight - rect.top + 4 } : { left: rect.left, top: rect.bottom + 4 }}
    >
      {slash.items.map((b, i) => (
        <div
          key={b.label}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === index}
          data-selected={i === index}
          // Mouse down, not click: the caret stays in the text, where the block goes.
          onMouseDown={(e) => {
            e.preventDefault();
            slash.run(b);
          }}
          onMouseMove={() => i !== index && onHover(i)}
          className="data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none"
        >
          <span className="bg-background flex size-8 shrink-0 items-center justify-center rounded-md border">
            <b.icon className="text-muted-foreground size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{b.label}</span>
            <span className="text-muted-foreground block truncate text-xs">{b.hint}</span>
          </span>
          {b.md && <code className="text-muted-foreground font-mono text-xs">{b.md}</code>}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/**
 * A small icon button that keeps the editor's selection: a click acts on
 * mouse down, before focus moves; Enter or Space on it (a click with no
 * pointer, detail 0) acts on click.
 */
function Tool({ icon: I, label, keys, active, onRun }: { icon: Icon; label: string; keys?: string[]; active?: boolean; onRun: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(e) => {
            e.preventDefault();
            onRun();
          }}
          onClick={(e) => e.detail === 0 && onRun()}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors",
            active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <I className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {keys && <Kbd keys={keys} className="ml-2" />}
      </TooltipContent>
    </Tooltip>
  );
}

const bar = "bg-popover relative z-50 flex items-center gap-0.5 rounded-lg border p-1 shadow-md";

/** On a selection: marks, a link, and what the block is. */
function TextMenu({ editor, linking, setLinking }: { editor: Editor; linking: string | null; setLinking: (v: string | null) => void }) {
  // The link that was refused, while it is still what the field says.
  const [refused, setRefused] = useState<string | null>(null);
  const hint = useId();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      quote: e.isActive("blockquote"),
    }),
  });
  const c = () => editor.chain().focus();
  const bad = linking !== null && refused === linking;
  return (
    <BubbleMenu editor={editor} options={{ placement: "top" }} className={bar}>
      {linking !== null ? (
        <form
          className="flex flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!linking.trim()) {
              c().extendMarkRange("link").unsetLink().run();
              return setLinking(null);
            }
            const href = linkHref(linking);
            // A refused link keeps the field open, saying why, rather than vanishing.
            if (!safeUrl(href)) return setRefused(linking);
            c().extendMarkRange("link").setLink({ href }).run();
            setLinking(null);
          }}
        >
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={linking}
              onChange={(e) => setLinking(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), setLinking(null), editor.commands.focus())}
              placeholder="Paste a link, Enter to apply"
              aria-label="Link"
              aria-invalid={bad || undefined}
              aria-describedby={bad ? hint : undefined}
              className={cn("w-56 rounded-sm bg-transparent px-2 text-sm outline-none", bad && "ring-destructive/60 ring-2")}
            />
            <Tool icon={IconX} label="Cancel" onRun={() => (setLinking(null), editor.commands.focus())} />
          </div>
          {bad && (
            <p id={hint} className="text-destructive px-2 pt-1 pb-0.5 text-xs">
              Only web and email links
            </p>
          )}
        </form>
      ) : (
        <>
          <Tool icon={IconBold} label="Bold" keys={["mod", "B"]} active={s.bold} onRun={() => c().toggleBold().run()} />
          <Tool icon={IconItalic} label="Italic" keys={["mod", "I"]} active={s.italic} onRun={() => c().toggleItalic().run()} />
          <Tool
            icon={IconStrikethrough}
            label="Strikethrough"
            keys={["mod", "⇧", "S"]}
            active={s.strike}
            onRun={() => c().toggleStrike().run()}
          />
          <Tool icon={IconCode} label="Code" keys={["mod", "E"]} active={s.code} onRun={() => c().toggleCode().run()} />
          <Tool
            icon={IconLink}
            label="Link"
            keys={["mod", "K"]}
            active={s.link}
            onRun={() => setLinking(editor.getAttributes("link").href ?? "")}
          />
          <span className="bg-border mx-0.5 h-5 w-px" />
          <Tool icon={IconH2} label="Heading" keys={["mod", "⌥", "2"]} active={s.h2} onRun={() => c().toggleHeading({ level: 2 }).run()} />
          <Tool icon={IconH3} label="Subheading" keys={["mod", "⌥", "3"]} active={s.h3} onRun={() => c().toggleHeading({ level: 3 }).run()} />
          <Tool icon={IconBlockquote} label="Quote" keys={["mod", "⇧", "B"]} active={s.quote} onRun={() => c().toggleBlockquote().run()} />
        </>
      )}
    </BubbleMenu>
  );
}

/** In a table: rows and columns, in and out. Over the text, not in its flow, so entering a table moves nothing. */
function TableBar({ editor }: { editor: Editor }) {
  const inTable = useEditorState({ editor, selector: ({ editor: e }) => e.isActive("table") });
  if (!inTable) return null;
  const c = () => editor.chain().focus();
  return (
    <div className={cn(bar, "absolute -top-10 left-0 z-10 w-fit shadow-sm")} role="toolbar" aria-label="Table">
      <Tool icon={IconRowInsertTop} label="Row above" onRun={() => c().addRowBefore().run()} />
      <Tool icon={IconRowInsertBottom} label="Row below" onRun={() => c().addRowAfter().run()} />
      <Tool icon={IconRowRemove} label="Delete row" onRun={() => c().deleteRow().run()} />
      <span className="bg-border mx-0.5 h-5 w-px" />
      <Tool icon={IconColumnInsertLeft} label="Column left" onRun={() => c().addColumnBefore().run()} />
      <Tool icon={IconColumnInsertRight} label="Column right" onRun={() => c().addColumnAfter().run()} />
      <Tool icon={IconColumnRemove} label="Delete column" onRun={() => c().deleteColumn().run()} />
      <span className="bg-border mx-0.5 h-5 w-px" />
      <Tool icon={IconTableOff} label="Delete table" onRun={() => c().deleteTable().run()} />
    </div>
  );
}
