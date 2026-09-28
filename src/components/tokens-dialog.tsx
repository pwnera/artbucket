"use client";

import { useEffect, useState } from "react";
import { IconCopy, IconDownload, IconLink, IconRefresh } from "@tabler/icons-react";
import type { BrandInfo } from "@/components/brand-switcher";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { contextLabel } from "@/lib/rules";
import { TOKEN_FORMAT_IDS, TOKEN_FORMATS, type TokenFormat, type TokenFormatId } from "@/lib/tokens";
import { cn } from "@/lib/utils";

/** This brand's tokens in one format, as the API serves them. */
/** The brand as the dialog needs it; no `default`, and the path names it anyway. */
type TokenBrand = Pick<BrandInfo, "slug" | "name"> & { default?: boolean };

export const tokensPath = (brand: TokenBrand, context: string | undefined, format: TokenFormatId) => {
  const q = new URLSearchParams({ format });
  if (!brand.default) q.set("brand", brand.slug);
  if (context) q.set("context", context);
  return `/api/v1/brand/tokens?${q}`;
};

const GROUPS = [...new Set(Object.values(TOKEN_FORMATS).map((f: TokenFormat) => f.group))].map((group) => ({
  group,
  ids: TOKEN_FORMAT_IDS.filter((id) => TOKEN_FORMATS[id].group === group),
}));

/**
 * The brand as code: pick the format your stack reads, see exactly what it
 * gets, copy it, download it, or link it. Each preview is fetched from the
 * API, so it is the file an agent or a build would get.
 */
export function TokensDialog({
  brand,
  context,
  open,
  onOpenChange,
}: {
  brand: TokenBrand;
  context?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Outlives the dialog, so it opens on the format you last looked at.
  const [format, setFormat] = useState<TokenFormatId>("css");
  const f = TOKEN_FORMATS[format];
  const name = `${brand.slug}${context ? `-${context}` : ""}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85svh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>Design tokens</DialogTitle>
          <DialogDescription>
            {brand.name}
            {context && ` in ${contextLabel(context)}`}: colors, fonts and the type scale as code for your stack. Each file
            is also a link that stays current.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav aria-label="Formats" className="hidden w-52 shrink-0 space-y-4 overflow-y-auto border-r p-2 md:block">
            {GROUPS.map(({ group, ids }) => (
              <div key={group} className="space-y-0.5">
                <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">{group}</p>
                {ids.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-current={id === format}
                    onClick={() => setFormat(id)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      id === format ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    {TOKEN_FORMATS[id].label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-b p-2 md:hidden">
            <Select value={format} onValueChange={(v) => setFormat(v as TokenFormatId)}>
              <SelectTrigger className="w-full" aria-label="Format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPS.map(({ group, ids }) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {ids.map((id) => (
                      <SelectItem key={id} value={id}>
                        {TOKEN_FORMATS[id].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Preview path={tokensPath(brand, context, format)} file={f.file(name)} hint={f.hint} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One format: its file name, what it is for, and the file itself, highlighted. */
function Preview({ path, file, hint }: { path: string; file: string; hint: string }) {
  // Fetched once per format while the dialog is open; reopening it fetches what the brand is now.
  const [files, setFiles] = useState<Record<string, string | null>>({});
  const code = files[path];
  useEffect(() => {
    if (path in files) return;
    let live = true;
    fetch(path, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
      .then((text) => live && setFiles((f) => ({ ...f, [path]: text })));
    return () => {
      live = false;
    };
  }, [path, files]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm">{file}</p>
          <p className="text-muted-foreground truncate text-xs" title={hint}>
            {hint}
          </p>
        </div>
        {code ? (
          <CopyButton text={code} label={`Copy ${file}`} what={file} size="icon-sm" />
        ) : (
          // Held in place until there is something to copy, so the bar doesn't shift.
          <IconButton variant="ghost" label={`Copy ${file}`} disabled>
            <IconCopy />
          </IconButton>
        )}
        <CopyButton
          // Built in the click: `location` is the browser's.
          text={async () => new URL(path, location.origin).href}
          label="Copy a link to this file: a build or a <link> gets the brand as it is now"
          what="the link"
          size="icon-sm"
          icon={IconLink}
        />
        <Button variant="ghost" size="sm" asChild>
          <a href={path} download={file}>
            <IconDownload />
            <span className="sr-only sm:not-sr-only">Download</span>
          </a>
        </Button>
      </div>
      <pre className="bg-muted/30 min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
        {code === undefined ? (
          // Lines of code, not a word: the pane keeps its shape while the file comes.
          <span role="status" aria-label="Loading" className="grid gap-2.5">
            {[40, 65, 55, 80, 30, 70, 50, 60].map((w, i) => (
              <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
            ))}
          </span>
        ) : code === null ? (
          <span className="flex flex-wrap items-center gap-3 font-sans">
            <span className="text-destructive">Couldn&apos;t load this format.</span>
            {/* Forgetting the failure re-runs the fetch. */}
            {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
            <Button variant="outline" size="sm" onClick={() => setFiles(({ [path]: _, ...f }) => f)}>
              <IconRefresh /> Retry
            </Button>
          </span>
        ) : (
          <code>
            <Highlight code={code} />
          </code>
        )}
      </pre>
    </div>
  );
}

/**
 * Enough highlighting for what lib/tokens.ts writes (CSS, Sass, Less, JS and
 * JSON, all of it generated, none of it hand-written): comments, keys,
 * strings, colors with a swatch, numbers, at-rules and keywords.
 */
const TOKEN =
  /(?<comment>\/\*[\s\S]*?\*\/|\/\/[^\n]*)|(?<key>"(?:[^"\\\n]|\\.)*"(?=\s*:))|(?<string>"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(?<color>#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b)|(?<at>@[\w-]+)|(?<variable>--[\w-]+|\$[\w-]+)|(?<keyword>\b(?:export|default|const|import|from|as|type)\b)|(?<number>\b\d+(?:\.\d+)?(?:px|rem|em|%)?\b)|(?<property>\b[\w-]+(?=\s*:))/g;

const STYLE: Record<string, string> = {
  comment: "text-muted-foreground italic",
  key: "text-sky-700 dark:text-sky-300",
  variable: "text-sky-700 dark:text-sky-300",
  property: "text-sky-700 dark:text-sky-300",
  string: "text-emerald-700 dark:text-emerald-300",
  color: "text-amber-700 dark:text-amber-300",
  number: "text-amber-700 dark:text-amber-300",
  at: "text-violet-700 dark:text-violet-300",
  keyword: "text-violet-700 dark:text-violet-300",
};

function Highlight({ code }: { code: string }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > i) out.push(code.slice(i, m.index));
    const kind = Object.entries(m.groups!).find(([, v]) => v !== undefined)![0];
    // A color shows as one, quoted or not.
    const hex = kind !== "comment" && /^["']?(#[0-9a-f]{6}(?:[0-9a-f]{2})?)["']?$/i.exec(m[0])?.[1];
    out.push(
      <span key={m.index} className={STYLE[kind]}>
        {hex && (
          <span
            aria-hidden
            className="mr-1 inline-block size-2.5 rounded-sm align-[-1px] ring-1 ring-black/15 dark:ring-white/20"
            style={{ backgroundColor: hex }}
          />
        )}
        {m[0]}
      </span>,
    );
    i = m.index + m[0].length;
  }
  out.push(code.slice(i));
  return out;
}
