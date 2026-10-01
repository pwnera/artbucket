import { IconDownload } from "@tabler/icons-react";
import type { Status } from "@/components/builder/use-status";

/** A few names, then how many more. */
const some = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));

/**
 * What people outside the workspace take of a brand's files, said where it
 * goes out to them (release, Sharing): how many they may download, and the
 * ones they only see (lib/core/brand-status.ts filesOut). Nothing to say
 * about a brand without files.
 */
export function FilesOut({ name, files }: { name: string; files: NonNullable<Status["files"]> }) {
  const n = files.downloadable;
  const kept = files.shownOnly;
  if (!n && !kept.length) return null;
  return (
    <p role="note" className="bg-muted flex gap-2 rounded-md px-3 py-2 text-sm">
      <IconDownload aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <span>
        {n > 0 ? (
          <>
            Anyone outside the workspace who sees {name} can download {kept.length ? `${n} of its files` : n === 1 ? "its file" : `all ${n} of its files`}.
          </>
        ) : (
          <>Nobody outside the workspace can download {name}&apos;s files.</>
        )}{" "}
        {kept.length > 0 && (
          <>
            {kept.length === 1 ? "One is" : `${kept.length} are`} shown only: {some(kept.map((f) => f.filename))}.{" "}
          </>
        )}
        <span className="text-muted-foreground">Each file&apos;s Rights set this, under Downloads.</span>
      </span>
    </p>
  );
}
