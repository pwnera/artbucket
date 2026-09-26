/**
 * Truncate a file name for display: shorten the stem, always keep the
 * extension. `fox_turnaround_v3_final.psd` must never render as `fox_tur…`,
 * because the extension is the part that tells you what the file is.
 */
export function truncateFilename(name: string, max = 24): string {
  if (name.length <= max) return name;

  const dot = name.lastIndexOf(".");
  // No extension, or a dot-file, or an extension longer than the budget: trim the end.
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : "";
  const stem = ext ? name.slice(0, dot) : name;

  const room = max - ext.length - 1; // 1 for the ellipsis
  if (room <= 0) return name.slice(0, Math.max(1, max - 1)) + "…";

  const head = Math.ceil(room / 2);
  const tail = room - head;
  return `${stem.slice(0, head)}…${tail > 0 ? stem.slice(-tail) : ""}${ext}`;
}

/** The uppercase file-type badge: PSD, PNG, JPG. */
export function fileTypeBadge(filename: string, mime: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot > 0 && filename.length - dot <= 6) return filename.slice(dot + 1).toUpperCase();
  return (mime.split("/")[1] ?? "file").toUpperCase();
}

/**
 * Byte sizes for the meta row. One decimal above bytes while the number stays
 * under 100, matching the scale's own sample: `4096 × 2731 · 12.4 MB · 2 d ago`.
 */
export function formatBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i > 0 && n < 100 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}
