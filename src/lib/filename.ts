/**
 * Truncate a file name for display: shorten the stem, always keep the
 * extension. `fox_turnaround_v3_final.psd` must never render as `fox_tur…`,
 * because the extension is the part that tells you what the file is.
 */
export function truncateFilename(name: string, max = 24): string {
  // By code point, not UTF-16 unit: a cut through an emoji leaves half of it, which shows as �.
  if ([...name].length <= max) return name;

  const dot = name.lastIndexOf(".");
  // No extension, or a dot-file, or an extension longer than the budget: trim the end.
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : "";
  const stem = ext ? name.slice(0, dot) : name;

  const room = max - ext.length - 1; // 1 for the ellipsis
  if (room <= 0) return [...name].slice(0, Math.max(1, max - 1)).join("") + "…";

  const chars = [...stem];
  const head = Math.ceil(room / 2);
  const tail = room - head;
  return `${chars.slice(0, head).join("")}…${tail > 0 ? chars.slice(-tail).join("") : ""}${ext}`;
}

/**
 * A Content-Disposition naming the file, as RFC 6266 has it: `filename*` in
 * UTF-8, percent-encoded past what encodeURIComponent leaves, since a ' ( )
 * or * there is outside RFC 5987 and Chrome drops a value with a third quote.
 */
export const disposition = (kind: "inline" | "attachment", filename: string) =>
  `${kind}; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;

/** The uppercase file-type badge: PSD, PNG, JPG. */
export function fileTypeBadge(filename: string, mime: string, probe?: Record<string, unknown> | null): string {
  // A link is named by its title, whose dots say nothing about it: its service says what it is.
  if (mime === "text/uri-list") return typeof probe?.service === "string" ? probe.service.toUpperCase() : "LINK";
  const dot = filename.lastIndexOf(".");
  // Up to ten letters after the dot: .lottie and .procreate are extensions too; "v1.2 final" is no extension.
  if (dot > 0 && /^\.[a-z0-9]{1,10}$/i.test(filename.slice(dot))) return filename.slice(dot + 1).toUpperCase();
  // No extension: the type says it, but "octet-stream" says nothing and "x-" is no part of a name.
  const sub = mime.split("/")[1];
  return !sub || sub === "octet-stream" ? "FILE" : sub.replace(/^x-/, "").toUpperCase();
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
