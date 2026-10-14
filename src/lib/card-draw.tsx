import { ImageResponse } from "next/og";
import { CARD_TEMPLATES, titleSize, type CardQuery, type CardTemplate } from "@/lib/cards";
import { contrast, inkOn } from "@/lib/color";

/**
 * A card drawn (lib/core/cards.ts reads what from): Satori lays the JSX out,
 * sharp makes it a PNG. Its faces are `head` and `body`, each the other's
 * when one is missing, both the renderer's Geist when neither is there or
 * one can't be read after all.
 */

export type Pic = { src: string; width: number; height: number; tone: string } | null;
type Look = { paper: string; ink: string; muted: string; accentText: string; field: string };
export type CardProps = Look & { name: string; q: CardQuery; side: number; logo: Pic; image: Pic };

const face = (name: string, data: Buffer) => ({ name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, weight: 400 as const, style: "normal" as const });

export async function drawCard(template: CardTemplate, props: CardProps, files: { head: Buffer | null; body: Buffer | null }) {
  const { width, height } = CARD_TEMPLATES[template];
  const { head, body } = files;
  const fonts = [head && face("head", head), body && face("body", body)].filter((f) => !!f);
  const png = async (faces: boolean) => {
    const el = <OgCard {...props} headFace={faces ? (head ? "head" : body ? "body" : undefined) : undefined} bodyFace={faces ? (body ? "body" : head ? "head" : undefined) : undefined} />;
    return Buffer.from(await new ImageResponse(el, { width, height, ...(faces && fonts.length && { fonts }) }).arrayBuffer());
  };
  try {
    return await png(true);
  } catch (err) {
    // A face the renderer can't parse after all: the card in its fallback rather than no card.
    if (!fonts.length) throw err;
    return png(false);
  }
}

/** Satori reads an undefined family as a broken one: left out, the text is in the fallback. */
const family = (name?: string) => (name ? { fontFamily: name } : {});

/**
 * The Open Graph card, 1200x630: the logo up top, the eyebrow, title and
 * subtitle set low on the paper with generous margins, and the accent as a
 * solid field on the right, the picture filling it when there is one.
 */
function OgCard({ paper, ink, muted, accentText, field, name, q, side, logo, image, headFace, bodyFace }: CardProps & { headFace?: string; bodyFace?: string }) {
  // The logo at 64px tall, narrowed to fit 400px wide.
  const lh = logo ? Math.min(64, (64 * 400) / Math.max(1, (logo.width / logo.height) * 64)) : 0;
  // A logo that doesn't read on the paper (a black mark on a dark card, with no reversed one) sits on a tile of the other ground.
  const tile = logo && contrast(logo.tone, paper) < 2 ? inkOn(logo.tone) : null;
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: paper, ...family(bodyFace) }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "72px 80px 80px 80px" }}>
        {logo ? (
          <div style={{ display: "flex", alignSelf: "flex-start", ...(tile && { background: tile, padding: 16, borderRadius: 16, margin: -16 }) }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={logo.src} height={lh} width={(logo.width / logo.height) * lh} />
          </div>
        ) : (
          <div style={{ display: "flex", ...family(headFace), fontSize: 40, color: ink, letterSpacing: "-0.01em" }}>{name}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {q.eyebrow && (
            <div style={{ display: "flex", fontSize: 24, letterSpacing: "0.14em", textTransform: "uppercase", color: accentText, marginBottom: 24 }}>{q.eyebrow}</div>
          )}
          <div style={{ display: "block", ...family(headFace), fontSize: titleSize(q.title), lineHeight: 1.04, letterSpacing: "-0.025em", color: ink, lineClamp: 3 }}>
            {q.title}
          </div>
          {q.subtitle && <div style={{ display: "block", fontSize: 30, lineHeight: 1.35, color: muted, marginTop: 28, lineClamp: 2 }}>{q.subtitle}</div>}
        </div>
      </div>
      <div style={{ display: "flex", width: side, height: "100%", background: field }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        {image && <img src={image.src} width={side} height={image.height * (side / image.width)} style={{ objectFit: "cover", width: side, height: "100%" }} />}
      </div>
    </div>
  );
}
