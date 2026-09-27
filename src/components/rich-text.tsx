"use client";

import { useEffect, useState } from "react";
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
  IconPlus,
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
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import type { Asset } from "@/components/gallery";
import { Thumb } from "@/components/gallery";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { safeUrl } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { hasPreview } from "@/lib/preview";

/**
 * Markdown, edited like Medium: select text for a toolbar (bold, italic,
 * link, headings, quote), start an empty line with + for blocks (image,
 * table, divider, code, lists), or type the Markdown shortcuts (`## `, `- `,
 * `> `, three backticks, `---`). What it saves is the Markdown, so agents read
 * exactly what the page renders. Saves when you leave it; Esc leaves it.
 */
export default function RichText({
  value,
  onSave,
  placeholder,
  label,
  className,
  style,
}: {
  value: string;
  onSave: (markdown: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [picking, setPicking] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Underline has no Markdown, so it would not survive a save.
      StarterKit.configure({ underline: false, heading: { levels: [2, 3] }, link: { openOnClick: false, isAllowedUri: safeUrl } }),
      Markdown,
      TableKit.configure({ table: { resizable: false } }),
      Image,
      Placeholder.configure({ placeholder: placeholder ?? "Write, or start a line with + for a table, an image, a divider" }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: { class: cn("rich outline-none", className), ...(label ? { "aria-label": label } : {}) },
      handleKeyDown: (view, e) => {
        if (e.key !== "Escape") return false;
        view.dom.blur();
        return true;
      },
    },
    onBlur: ({ editor }) => {
      const md = editor.getMarkdown().trim();
      if (md !== value.trim()) onSave(md);
    },
  });

  // What the server saved comes back; take it unless you are mid-edit.
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getMarkdown().trim() !== value.trim())
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className={cn("rich min-h-7", className)} style={style} />;
  return (
    <div className="relative pl-8" style={style}>
      <TextMenu editor={editor} />
      <BlockMenu editor={editor} onImage={() => setPicking(true)} />
      <TableBar editor={editor} />
      <EditorContent editor={editor} />
      {picking && (
        <ImagePicker
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

/** A small icon button that keeps the editor's selection: it acts on mouse down, before focus moves. */
function Tool({ icon: I, label, active, onRun }: { icon: Icon; label: string; active?: boolean; onRun: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onRun();
      }}
      className={cn(
        "flex size-7 items-center justify-center rounded-md transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <I className="size-4" />
    </button>
  );
}

const bar = "bg-popover relative z-50 flex items-center gap-0.5 rounded-lg border p-1 shadow-md";

/** On a selection: marks, a link, and what the block is. */
function TextMenu({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState<string | null>(null);
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
  return (
    <BubbleMenu editor={editor} options={{ placement: "top" }} className={bar}>
      {linking !== null ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const href = linking.trim();
            if (!href) c().extendMarkRange("link").unsetLink().run();
            else if (safeUrl(href)) c().extendMarkRange("link").setLink({ href }).run();
            setLinking(null);
          }}
        >
          <input
            autoFocus
            value={linking}
            onChange={(e) => setLinking(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), setLinking(null), editor.commands.focus())}
            placeholder="Paste a link, Enter to apply"
            aria-label="Link"
            className="w-56 bg-transparent px-2 text-sm outline-none"
          />
          <Tool icon={IconX} label="Cancel" onRun={() => (setLinking(null), editor.commands.focus())} />
        </form>
      ) : (
        <>
          <Tool icon={IconBold} label="Bold" active={s.bold} onRun={() => c().toggleBold().run()} />
          <Tool icon={IconItalic} label="Italic" active={s.italic} onRun={() => c().toggleItalic().run()} />
          <Tool icon={IconStrikethrough} label="Strikethrough" active={s.strike} onRun={() => c().toggleStrike().run()} />
          <Tool icon={IconCode} label="Code" active={s.code} onRun={() => c().toggleCode().run()} />
          <Tool icon={IconLink} label="Link" active={s.link} onRun={() => setLinking(editor.getAttributes("link").href ?? "")} />
          <span className="bg-border mx-0.5 h-5 w-px" />
          <Tool icon={IconH2} label="Heading" active={s.h2} onRun={() => c().toggleHeading({ level: 2 }).run()} />
          <Tool icon={IconH3} label="Subheading" active={s.h3} onRun={() => c().toggleHeading({ level: 3 }).run()} />
          <Tool icon={IconBlockquote} label="Quote" active={s.quote} onRun={() => c().toggleBlockquote().run()} />
        </>
      )}
    </BubbleMenu>
  );
}

/** On an empty line, Medium's +: open it for the blocks. */
function BlockMenu({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const [open, setOpen] = useState(false);
  const c = () => editor.chain().focus();
  const run = (f: () => void) => () => {
    f();
    setOpen(false);
  };
  return (
    <FloatingMenu
      editor={editor}
      options={{ placement: "left", offset: 6, onHide: () => setOpen(false) }}
      className="flex items-center gap-1"
    >
      <button
        type="button"
        aria-label={open ? "Close the blocks" : "Add a block"}
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className={cn(
          "text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-full border transition-transform",
          open && "rotate-45",
        )}
      >
        <IconPlus className="size-3.5" />
      </button>
      {open && (
        <div className={cn(bar, "absolute left-8")}>
          <Tool icon={IconPhoto} label="Image from the library" onRun={run(onImage)} />
          <Tool
            icon={IconTable}
            label="Table"
            onRun={run(() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          />
          <Tool icon={IconSeparator} label="Divider" onRun={run(() => c().setHorizontalRule().run())} />
          <Tool icon={IconSourceCode} label="Code block" onRun={run(() => c().toggleCodeBlock().run())} />
          <Tool icon={IconBlockquote} label="Quote" onRun={run(() => c().toggleBlockquote().run())} />
          <Tool icon={IconList} label="Bulleted list" onRun={run(() => c().toggleBulletList().run())} />
          <Tool icon={IconListNumbers} label="Numbered list" onRun={run(() => c().toggleOrderedList().run())} />
          <Tool icon={IconH2} label="Heading" onRun={run(() => c().toggleHeading({ level: 2 }).run())} />
        </div>
      )}
    </FloatingMenu>
  );
}

/** In a table: rows and columns, in and out. */
function TableBar({ editor }: { editor: Editor }) {
  const inTable = useEditorState({ editor, selector: ({ editor: e }) => e.isActive("table") });
  if (!inTable) return null;
  const c = () => editor.chain().focus();
  return (
    <div className={cn(bar, "sticky top-0 z-10 mb-2 w-fit shadow-sm")} role="toolbar" aria-label="Table">
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

/**
 * Pick one asset from the library: an image, unless `any`. Here, an image
 * into the text at its full size as WebP; the URL is absolute, so agents can fetch it.
 */
export function ImagePicker({
  onClose,
  onPick,
  title = "Add an image",
  description = "From the library. It goes in the text where the cursor was.",
  any = false,
  exclude,
}: {
  onClose: () => void;
  onPick: (a: Asset) => void;
  title?: string;
  description?: string;
  any?: boolean;
  /** Not offered: the asset being edited, say. */
  exclude?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Asset[] | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/v1/assets?limit=48${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      const all: Asset[] = res.ok ? (await res.json()).data : [];
      setResults(all.filter((a) => (any || hasPreview(a)) && a.id !== exclude));
    }, 200);
    return () => clearTimeout(t);
  }, [q, any, exclude]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" />
        <div className="-mx-1 max-h-[50vh] overflow-y-auto p-1">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {results?.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick(a)}
                className="bg-muted hover:ring-primary relative aspect-square overflow-hidden rounded-md border hover:ring-2"
              >
                {hasPreview(a) ? (
                  <Thumb src={`/a/${a.id}/w_160,f_webp`} alt={a.filename} />
                ) : (
                  <span className="text-muted-foreground absolute inset-0 flex items-center justify-center p-2 text-center text-xs break-all">
                    {a.filename}
                  </span>
                )}
              </button>
            ))}
            {results?.length === 0 && (
              <p className="text-muted-foreground col-span-full py-8 text-center text-sm">{any ? "Nothing found." : "No images found."}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
