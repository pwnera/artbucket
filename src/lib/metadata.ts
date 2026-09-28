import ExifReader, { type ExpandedTags } from "exifreader";

/**
 * The embedded metadata a DAM actually searches on, flattened from EXIF, IPTC
 * and XMP. Where the three disagree, XMP wins, then IPTC, then EXIF: that is
 * the order editors (Lightroom, Bridge, Photo Mechanic) write them in, so XMP
 * is the most likely to reflect the last human edit.
 *
 * Everything else in the file is left in the file. The original bytes are kept
 * verbatim, so nothing is lost by not copying it into the database.
 */
export type Metadata = {
  title?: string;
  description?: string;
  keywords?: string[];
  creator?: string;
  copyright?: string;
  /** Local time as shot, ISO 8601 without an offset: EXIF rarely records one. */
  capturedAt?: string;
  camera?: string;
  lens?: string;
  gps?: { lat: number; lon: number };
  /** Where a crop must keep: 0 to 1 from the top left. Set by a person, never read from the file. */
  focus?: { x: number; y: number };
};

type Tag = { value?: unknown; description?: unknown } | undefined;
type TagList = Tag | Tag[];

const text = (tag: TagList): string | undefined => {
  const t = Array.isArray(tag) ? tag[0] : tag;
  const d = t?.description;
  return typeof d === "string" && d.trim() ? d.trim() : undefined;
};

/** IPTC repeats a tag per keyword; XMP nests them in a bag. Both flatten here. */
const list = (tag: TagList): string[] => {
  if (!tag) return [];
  if (Array.isArray(tag)) return tag.flatMap(list);
  if (Array.isArray(tag.value)) return tag.value.flatMap((v) => list(v as Tag));
  const t = text(tag);
  return t ? [t] : [];
};

const first = <T>(...xs: (T | undefined)[]) => xs.find((x) => x !== undefined);

const exifDate = (s?: string) => {
  const m = s?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : undefined;
};

export function extractMetadata(bytes: Buffer): Metadata | null {
  let tags: ExpandedTags;
  try {
    tags = ExifReader.load(bytes, { expanded: true });
  } catch {
    return null; // No metadata segment, or not a format exifreader knows.
  }
  const exif = (tags.exif ?? {}) as Record<string, TagList>;
  const iptc = (tags.iptc ?? {}) as Record<string, TagList>;
  const xmp = (tags.xmp ?? {}) as Record<string, TagList>;

  const make = text(exif.Make);
  const model = text(exif.Model);
  const keywords = [...new Set([...list(xmp.subject), ...list(iptc.Keywords)])];

  const m: Metadata = {
    title: first(text(xmp.title), text(iptc["Object Name"])),
    description: first(
      text(xmp.description),
      text(iptc["Caption/Abstract"]),
      text(exif.ImageDescription),
    ),
    keywords: keywords.length ? keywords : undefined,
    creator: first(text(xmp.creator), text(iptc["By-line"]), text(exif.Artist)),
    copyright: first(text(xmp.rights), text(iptc["Copyright Notice"]), text(exif.Copyright)),
    capturedAt: exifDate(first(text(exif.DateTimeOriginal), text(exif.DateTime))),
    // Model usually repeats the make ("Canon" / "Canon EOS R5"); don't say it twice.
    camera: model && make && !model.startsWith(make) ? `${make} ${model}` : (model ?? make),
    lens: text(exif.LensModel),
    gps:
      typeof tags.gps?.Latitude === "number" && typeof tags.gps?.Longitude === "number"
        ? { lat: tags.gps.Latitude, lon: tags.gps.Longitude }
        : undefined,
  };

  const present = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
  return Object.keys(present).length ? (present as Metadata) : null;
}
