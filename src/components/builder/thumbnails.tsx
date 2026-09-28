"use client";

import type { Template } from "@/lib/pages";

/**
 * A template drawn small (build spec 3.5.2, W6.2): one static SVG per
 * template, in currentColor, for the seam's gallery and the toolbar's
 * template switch.
 *
 * Props:
 * - template: which one.
 * - className: its size and color.
 */
export type ThumbnailProps = {
  template: Template;
  className?: string;
};

/** A block at an opacity of currentColor: a line of text, a picture, a ground. */
const R = ({ x, y, w, h, o = 0.25, r = 1 }: { x: number; y: number; w: number; h: number; o?: number; r?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={r} fill="currentColor" fillOpacity={o} />
);

/** A heading bar and a line under it, where most templates start. */
const Head = ({ y = 4 }: { y?: number }) => (
  <>
    <R x={4} y={y} w={18} h={3} o={0.6} />
    <R x={4} y={y + 5} w={28} h={1.5} o={0.25} />
  </>
);

const ART: Record<Template, React.ReactNode> = {
  cover: (
    <>
      <R x={0} y={0} w={48} h={30} o={0.2} r={0} />
      <R x={4} y={9} w={26} h={5} o={0.8} />
      <R x={4} y={16} w={18} h={2} o={0.45} />
      {[0.8, 0.55, 0.35, 0.2].map((o, i) => (
        <R key={i} x={4 + i * 10} y={24} w={10} h={3} o={o} r={0} />
      ))}
    </>
  ),
  header: (
    <>
      <R x={0} y={3} w={48} h={20} o={0.12} r={0} />
      <R x={4} y={7} w={6} h={1.5} o={0.4} />
      <R x={4} y={11} w={24} h={4} o={0.7} />
      <R x={4} y={17} w={32} h={1.5} o={0.3} />
    </>
  ),
  text: (
    <>
      <R x={10} y={4} w={18} h={3} o={0.6} />
      {[32, 30, 32, 20].map((w, i) => (
        <R key={i} x={10} y={11 + i * 4} w={w} h={1.5} o={0.3} />
      ))}
    </>
  ),
  split: (
    <>
      <R x={4} y={8} w={16} h={3} o={0.6} />
      <R x={4} y={14} w={18} h={1.5} o={0.3} />
      <R x={4} y={18} w={14} h={1.5} o={0.3} />
      <R x={26} y={4} w={18} h={22} o={0.2} />
      <path d="M28 23l5-7 4 5 2-3 3 5z" fill="currentColor" fillOpacity={0.4} />
    </>
  ),
  cards: (
    <>
      <Head />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <R x={4 + i * 14} y={14} w={12} h={12} o={0.12} />
          <R x={6 + i * 14} y={16} w={6} h={2} o={0.5} />
          <R x={6 + i * 14} y={20} w={8} h={1.5} o={0.3} />
        </g>
      ))}
    </>
  ),
  palette: (
    <>
      <Head />
      {[0.85, 0.6, 0.4, 0.2].map((o, i) => (
        <g key={i}>
          <R x={4 + i * 10.5} y={14} w={9} h={8} o={o} />
          <R x={4 + i * 10.5} y={24} w={6} h={1.5} o={0.3} />
        </g>
      ))}
    </>
  ),
  type: (
    <>
      <text x={4} y={20} fontSize={15} fontWeight={700} fill="currentColor" fillOpacity={0.7} fontFamily="serif">
        Aa
      </text>
      {[4, 3, 2.25, 1.5].map((h, i) => (
        <R key={i} x={28} y={6 + i * 5 + (4 - h) / 2} w={16 - i * 2} h={h} o={0.4} />
      ))}
    </>
  ),
  logos: (
    <>
      <Head />
      <R x={4} y={14} w={19} h={12} o={0.12} />
      <circle cx={13.5} cy={20} r={3} fill="currentColor" fillOpacity={0.6} />
      <R x={25} y={14} w={19} h={12} o={0.7} />
      <circle cx={34.5} cy={20} r={3} fill="currentColor" fillOpacity={0.15} />
    </>
  ),
  dodont: (
    <>
      <Head />
      <R x={4} y={14} w={19} h={12} o={0.12} />
      <path d="M10 20l2.5 2.5 5-5" stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.5} fill="none" />
      <R x={25} y={14} w={19} h={12} o={0.12} />
      <path d="M32 17.5l5 5m0-5l-5 5" stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.5} fill="none" />
    </>
  ),
  gallery: (
    <>
      <R x={4} y={4} w={22} h={13} o={0.3} />
      <R x={28} y={4} w={16} h={13} o={0.2} />
      <R x={4} y={19} w={12} h={8} o={0.2} />
      <R x={18} y={19} w={26} h={8} o={0.3} />
    </>
  ),
  collection: (
    <>
      <Head />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <R x={4 + i * 10.5} y={14} w={9} h={7} o={0.25} />
          <R x={4 + i * 10.5} y={23} w={7} h={1.5} o={0.3} />
        </g>
      ))}
    </>
  ),
  icons: (
    <>
      <Head />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <circle cx={7.5 + i * 6.6} cy={17.5} r={2.2} fill="none" stroke="currentColor" strokeOpacity={0.6} strokeWidth={1} />
          <R x={5.5 + i * 6.6} y={22.5} w={4} h={1.2} o={0.3} />
        </g>
      ))}
    </>
  ),
  links: (
    <>
      <Head />
      {[0, 1].map((i) => (
        <g key={i}>
          <R x={4} y={14 + i * 7} w={40} h={5.5} o={0.12} />
          <R x={7} y={16 + i * 7} w={14} h={1.5} o={0.5} />
          <path d={`M38 ${15.5 + i * 7}v3m-1.5-1.5l1.5 1.5 1.5-1.5`} stroke="currentColor" strokeOpacity={0.6} strokeWidth={1} fill="none" />
        </g>
      ))}
    </>
  ),
  pages: (
    <>
      <Head />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <R x={4 + i * 14} y={14} w={12} h={7} o={0.25} />
          <R x={4 + i * 14} y={23} w={9} h={2} o={0.5} />
        </g>
      ))}
    </>
  ),
  diagram: (
    <>
      <rect x={12} y={5} width={24} height={20} fill="none" stroke="currentColor" strokeOpacity={0.5} strokeDasharray="2 1.5" />
      <R x={18} y={10} w={12} h={10} o={0.6} />
      <path d="M12 3h6M12 2v2M18 2v2" stroke="currentColor" strokeOpacity={0.5} strokeWidth={0.75} />
    </>
  ),
  updates: (
    <>
      <path d="M8 6v20" stroke="currentColor" strokeOpacity={0.25} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={8} cy={7 + i * 8} r={1.75} fill="currentColor" fillOpacity={0.6} />
          <R x={13} y={5.5 + i * 8} w={14} h={2} o={0.5} />
          <R x={30} y={5.5 + i * 8} w={12} h={1.5} o={0.25} />
        </g>
      ))}
    </>
  ),
  annotated: (
    <>
      <R x={4} y={4} w={26} h={22} o={0.2} />
      {[
        [11, 11],
        [22, 19],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={2.25} fill="currentColor" fillOpacity={0.7} />
          <R x={34} y={8 + i * 9} w={10} h={2} o={0.5} />
          <R x={34} y={11.5 + i * 9} w={8} h={1.5} o={0.25} />
        </g>
      ))}
    </>
  ),
  specs: (
    <>
      <Head />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <R x={4} y={15 + i * 4.5} w={14} h={1.5} o={0.4} />
          <R x={24} y={15 + i * 4.5} w={7} h={1.5} o={0.3} />
          <R x={36} y={15 + i * 4.5} w={7} h={1.5} o={0.3} />
        </g>
      ))}
    </>
  ),
  specimen: (
    <>
      <Head />
      {[4, 8, 14, 22, 32].map((w, i) => (
        <R key={i} x={4} y={14 + i * 2.75} w={w} h={1.75} o={0.5} />
      ))}
    </>
  ),
  pattern: (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={8 + (i % 3) * 16} cy={9 + Math.floor(i / 3) * 12} r={4 - (i % 3)} fill="currentColor" fillOpacity={0.4} />
      ))}
    </>
  ),
  chart: (
    <>
      <Head />
      {[8, 12, 6, 10].map((h, i) => (
        <R key={i} x={6 + i * 9} y={26 - h} w={6} h={h} o={0.8 - i * 0.18} r={0.5} />
      ))}
    </>
  ),
  copy: (
    <>
      <Head />
      <R x={4} y={14} w={40} h={6} o={0.12} />
      <R x={6} y={16.25} w={22} h={1.5} o={0.5} />
      <rect x={38} y={15.5} width={4} height={3} rx={0.5} fill="none" stroke="currentColor" strokeOpacity={0.6} strokeWidth={0.75} />
      <R x={4} y={22} w={18} h={4} o={0.2} />
    </>
  ),
  faq: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <R x={4} y={4 + i * 8} w={40} h={6} o={i === 0 ? 0.2 : 0.1} />
          <R x={6} y={6.25 + i * 8} w={20} h={1.5} o={0.5} />
          <path d={`M39 ${6.25 + i * 8}l1.5 1.5 1.5-1.5`} stroke="currentColor" strokeOpacity={0.6} strokeWidth={0.75} fill="none" />
        </g>
      ))}
    </>
  ),
  embed: (
    <>
      <R x={6} y={4} w={36} h={22} o={0.2} />
      <path d="M21 10.5v9l8-4.5z" fill="currentColor" fillOpacity={0.6} />
    </>
  ),
  request: (
    <>
      <Head />
      <R x={4} y={15} w={40} h={4} o={0.12} />
      <R x={30} y={22} w={14} h={4} o={0.6} />
    </>
  ),
};

export function Thumbnail({ template, className }: ThumbnailProps) {
  return (
    <svg viewBox="0 0 48 30" aria-hidden className={className}>
      {ART[template]}
    </svg>
  );
}
