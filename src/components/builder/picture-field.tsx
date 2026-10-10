"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { IconPhoto, IconTrash, IconUpload } from "@/components/icons";
import { toast } from "sonner";
import { asMedia, upload } from "@/components/brand-sections/slots";
import type { BuilderApi } from "@/components/builder/use-builder";
import { useSite } from "@/components/site/site-context";
import { Thumb } from "@/components/thumb";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/components/gallery";

const LibraryPicker = lazy(() => import("@/components/asset-picker").then((m) => ({ default: m.LibraryPicker })));

/**
 * A picture the builder sets (a section's image or video, an item's
 * picture): its thumbnail, then a way to pick another from the library, to
 * upload one from the computer, and to take it away. The picked asset joins
 * the view's media first, so the canvas draws it at once. Drawn inside the
 * canvas's SiteProvider, whose `url` names renditions.
 *
 * Props:
 * - b: the builder.
 * - value: the asset's id, when there is one.
 * - onPick: the new id, or undefined to take it away.
 * - video: a video, not a picture.
 * - onRemove: in place of onPick(undefined), for a picture that can't be
 *   left out (an item of a gallery goes with it).
 * - removeLabel: what that button says.
 */
export function PictureField({
  b,
  id,
  value,
  onPick,
  video,
  onRemove,
  removeLabel = "Remove",
}: {
  b: BuilderApi;
  id?: string;
  value?: string;
  onPick(id: string | undefined): void;
  video?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const { url } = useSite();
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const m = value ? b.view.media[value] : undefined;
  const use = (a: Asset) => {
    b.addMedia([asMedia(a, url)]);
    onPick(a.id);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border">
        {m?.thumbnail ? <Thumb src={m.thumbnail} alt="" /> : <IconPhoto className="text-muted-foreground size-5" />}
      </span>
      <span className="flex flex-wrap gap-1">
        <Button id={id} type="button" variant="outline" size="xs" onClick={() => setPicking(true)}>
          <IconPhoto /> {value ? "Change" : "Pick"}
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={() => file.current?.click()}>
          <IconUpload /> Upload
        </Button>
        {(value || onRemove) && (
          <Button type="button" variant="ghost" size="xs" className="hover:text-destructive" onClick={() => (onRemove ? onRemove() : onPick(undefined))}>
            <IconTrash /> {removeLabel}
          </Button>
        )}
      </span>
      <input
        ref={file}
        type="file"
        accept={video ? "video/*" : "image/*,video/*"}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const t = toast.loading(`Uploading ${f.name}`);
          upload(f).then(
            (a) => {
              toast.success(`${f.name} is in the library`, { id: t });
              use(a);
            },
            (err: Error) => toast.error(err.message, { id: t }),
          );
        }}
      />
      {picking && (
        <Suspense>
          <LibraryPicker
            title={video ? "Pick a video" : "Pick a picture"}
            description="From the library."
            filter={video ? (a) => a.mime.startsWith("video/") : undefined}
            onClose={() => setPicking(false)}
            onPick={(a) => {
              setPicking(false);
              use(a);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
