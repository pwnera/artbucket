"use client";

import { Fragment } from "react";
import {
  IconArrowsMaximize,
  IconArchive,
  IconArrowBackUp,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFolderPlus,
  IconLink,
  IconLinkOff,
  IconSelect,
  IconShare,
  IconTrash,
  IconX,
} from "@/components/icons";
import { toast } from "sonner";
import { useCan } from "@/components/can";
import { CollectionIcon, type Collection } from "@/components/collections";
import { copyText } from "@/components/copy-button";
import type { Asset } from "@/components/gallery";
import { extOf, PRESETS, stem } from "@/components/renditions";
import { approve, moveTo, suggestions } from "@/components/review-actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Kbd } from "@/components/ui/kbd";
import { complain } from "@/lib/send";
import { undoable } from "@/lib/undo";
import { hasPreview } from "@/lib/preview";

/** Save a URL the way a download link would, without one on the page. */
function save(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

/** One thing a menu can do to an asset: rendered by the grid's context menu, and the editor's. */
export type AssetAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  run?: () => void;
  destructive?: boolean;
  /** A key hint, at the right edge. */
  shortcut?: React.ReactNode;
  /** A quiet note at the right edge, as "as uploaded". */
  hint?: string;
  /** A submenu instead of `run`. */
  items?: AssetAction[];
};

export type ActionContext = {
  onOpen: () => void;
  onShare: () => void;
  onPick?: () => void;
  selected?: boolean;
  onChanged: () => void;
  /** Change the listing's copy now; returns how to put it back. null takes it out. */
  local?: (fn: (a: Asset) => Asset | null) => () => void;
  /** The selection, when this asset is part of one bigger than itself: bulk items act on all of it. */
  bulk?: {
    count: number;
    /** Collections the person may add to. */
    into: Collection[];
    add: (c: Collection) => void;
    download: () => void;
    /** Opens the selection bar's delete confirmation; absent when not allowed on all of it. */
    remove?: () => void;
  };
};

/**
 * What can be done to `a`, in groups (a separator between each), each item
 * the same public call the rest of the app makes and only when allowed.
 * Changes show at once, go back if the request fails, and offer Undo where
 * the API can take them back.
 */
export function assetActions(a: Asset, can: ReturnType<typeof useCan>, ctx: ActionContext): AssetAction[][] {
  const reviewer = can("asset.review", a);
  const live = a.state !== "deleted";
  const approved = a.status === "active";
  const image = hasPreview(a) && !a.mime.startsWith("video/");

  const act = async (
    request: () => Promise<Response>,
    done: string,
    { local, undo }: { local?: (a: Asset) => Asset | null; undo?: () => Promise<unknown> } = {},
  ) => {
    const back = local && ctx.local?.(local);
    const r = await request().catch(() => null);
    if (!r?.ok) {
      back?.();
      // Offline, signed out or refused: said as every other change in the app says it.
      return void complain(r ? { status: r.status, error: (await r.json().catch(() => null))?.error ?? null } : null);
    }
    ctx.onChanged();
    if (!undo) return void toast.success(done);
    undoable(done, {
      undo: async () => {
        await undo();
        ctx.onChanged();
      },
    });
  };
  const patch = (body: object) =>
    fetch(`/api/v1/assets/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  // Throws on a refusal, so an Undo that didn't work says so.
  const ok = async (res: Promise<Response>) => {
    const r = await res;
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error?.message ?? "That didn't work");
    return r;
  };
  const restore = () => fetch(`/api/v1/assets/${a.id}/restore`, { method: "POST" });

  const { bulk } = ctx;
  if (bulk) {
    return [
      [
        { id: "open", label: "Open", icon: <IconArrowsMaximize />, run: ctx.onOpen, shortcut: "↵" },
        ...(ctx.onPick ? [{ id: "pick", label: "Deselect", icon: <IconSelect />, run: ctx.onPick }] : []),
      ],
      [
        { id: "download", label: `Download ${bulk.count}`, icon: <IconDownload />, run: bulk.download, hint: ".zip" },
        ...(bulk.into.length
          ? [
              {
                id: "add",
                label: `Add ${bulk.count} to`,
                icon: <IconFolderPlus />,
                items: bulk.into.map((c) => ({ id: c.id, label: c.name, icon: <CollectionIcon icon={c.icon} />, run: () => bulk.add(c) })),
              },
            ]
          : []),
      ],
      bulk.remove ? [{ id: "delete", label: `Delete ${bulk.count}…`, icon: <IconTrash />, run: bulk.remove, destructive: true }] : [],
    ];
  }

  const gone = (): Asset | null => null;
  return [
    [
      { id: "open", label: "Open", icon: <IconArrowsMaximize />, run: ctx.onOpen, shortcut: "↵" },
      ...(ctx.onPick
        ? [{ id: "pick", label: ctx.selected ? "Deselect" : "Select", icon: <IconSelect />, run: ctx.onPick, shortcut: <Kbd keys={["mod", "click"]} /> }]
        : []),
    ],
    [
      {
        id: "copy",
        label: "Copy link",
        icon: <IconCopy />,
        run: async () => {
          if (await copyText(new URL(`/?asset=${a.id}`, location.origin).href, { what: "the link" })) toast.success("Copied a link for people with access");
        },
      },
      ...(live ? [{ id: "share", label: "Share…", icon: <IconShare />, run: ctx.onShare }] : []),
      ...(!live
        ? []
        : image
          ? [
              {
                id: "download",
                label: "Download",
                icon: <IconDownload />,
                items: [
                  { id: "original", label: "Original", hint: "as uploaded", run: () => save(`/a/${a.id}?download`, a.filename) },
                  ...PRESETS.map((p) => ({
                    id: p.name,
                    label: p.name,
                    hint: extOf(p.spec),
                    run: () => save(`/a/${a.id}/${p.spec}`, `${stem(a.filename)}-${p.name.toLowerCase().replace(/\s+/g, "-")}.${extOf(p.spec)}`),
                  })),
                ],
              },
            ]
          : [{ id: "download", label: "Download", icon: <IconDownload />, run: () => save(`/a/${a.id}?download`, a.filename) }]),
    ],
    reviewer && live
      ? [
          ...(a.status === "proposed" || a.status === "draft" || (approved && suggestions(a))
            ? [
                {
                  id: "approve",
                  label: approved ? "Accept suggestions" : "Approve",
                  icon: <IconCheck />,
                  run: () => void act(() => approve(a), approved ? "Accepted the suggestions" : "Approved"),
                },
              ]
            : []),
          // The reason is written where the asset is seen: the editor.
          ...(a.status === "proposed" ? [{ id: "reject", label: "Reject…", icon: <IconX />, run: ctx.onOpen }] : []),
          ...(a.state === "active" || a.state === "expired"
            ? [
                {
                  id: "archive",
                  label: "Archive",
                  icon: <IconArchive />,
                  run: () =>
                    void act(() => moveTo(a, "archived"), "Archived: its links stop working", {
                      local: (x) => ({ ...x, status: "archived", state: "archived" }),
                      undo: () => ok(moveTo(a, a.status)),
                    }),
                },
              ]
            : []),
          ...(a.state === "archived"
            ? [
                {
                  id: "unarchive",
                  label: "Unarchive",
                  icon: <IconArrowBackUp />,
                  run: () =>
                    void act(() => moveTo(a, "active"), "Unarchived", {
                      local: (x) => ({ ...x, status: "active", state: "active" }),
                      undo: () => ok(moveTo(a, "archived")),
                    }),
                },
              ]
            : []),
        ]
      : [],
    approved && live && can("asset.share", a)
      ? [
          {
            id: "public",
            label: a.public ? "Turn off embed URL" : "Get an embed URL",
            icon: a.public ? <IconLinkOff /> : <IconLink />,
            run: () =>
              void act(() => patch({ public: !a.public }), a.public ? "Embed URL off: only the team opens it now" : "Embed URL on: anyone with it gets the file", {
                local: (x) => ({ ...x, public: !a.public }),
                undo: () => ok(patch({ public: !!a.public })),
              }),
          },
        ]
      : [],
    live && can("asset.delete", a)
      ? [
          {
            id: "delete",
            label: "Delete",
            icon: <IconTrash />,
            destructive: true,
            run: () =>
              void act(() => fetch(`/api/v1/assets/${a.id}`, { method: "DELETE" }), `Deleted ${a.filename}`, {
                local: gone,
                undo: () => ok(restore()),
              }),
          },
        ]
      : [],
    !live && can("asset.delete", a)
      ? [
          {
            id: "restore",
            label: "Restore",
            icon: <IconArrowBackUp />,
            run: () => void act(restore, `Restored ${a.filename}`),
          },
        ]
      : [],
  ].filter((g) => g.length > 0);
}

function Items({ items }: { items: AssetAction[] }) {
  return items.map((it) =>
    it.items ? (
      <ContextMenuSub key={it.id}>
        <ContextMenuSubTrigger>
          {it.icon} {it.label}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-72 w-60 overflow-y-auto">
          <Items items={it.items} />
        </ContextMenuSubContent>
      </ContextMenuSub>
    ) : (
      <ContextMenuItem key={it.id} variant={it.destructive ? "destructive" : "default"} onSelect={it.run}>
        {it.icon} {it.label}
        {it.shortcut && <ContextMenuShortcut>{it.shortcut}</ContextMenuShortcut>}
        {it.hint && <span className="text-muted-foreground ml-auto pl-4 font-mono text-2xs">{it.hint}</span>}
      </ContextMenuItem>
    ),
  );
}

/**
 * Right click on an asset: what its card, its row and its editor offer, in
 * one place. On an asset that is part of a selection, the menu acts on the
 * whole selection, as Finder's does.
 */
export function AssetMenu({ asset, children, ...ctx }: ActionContext & { asset: Asset; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Built only while open: a grid of hundreds renders none of them. */}
        <MenuBody asset={asset} ctx={ctx} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MenuBody({ asset: a, ctx }: { asset: Asset; ctx: ActionContext }) {
  const can = useCan();
  return (
    <>
      <ContextMenuLabel>{ctx.bulk ? `${ctx.bulk.count} selected` : a.metadata?.title || a.filename}</ContextMenuLabel>
      {assetActions(a, can, ctx).map((g, i) => (
        <Fragment key={i}>
          {i > 0 && <ContextMenuSeparator />}
          <Items items={g} />
        </Fragment>
      ))}
    </>
  );
}
