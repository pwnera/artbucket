/**
 * The ArtBucket icon set: 24px grid, 2px stroke, round caps and joins, open
 * shapes. Drawn with `currentColor` so a parent's text colour drives them -
 * `ink` by default, `ink-muted` when passive, `teal-ink` when active.
 *
 * Icons never carry eyes, faces or fills. That is Pip's alone.
 */
type IconProps = { size?: 16 | 20 | 24; className?: string };

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2, // holds at every size
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className,
});

export function UploadIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 15V5M7.5 9.5L12 5l4.5 4.5M5 15.5v2A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-2" />
    </svg>
  );
}

export function ImageIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20.5 15.5l-4.5-4.5-9.5 8.5" />
    </svg>
  );
}

export function AlertIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16h.01" />
    </svg>
  );
}

/** The mark: the bucket with its drip, no face. Never Pip. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <path
        d="M16 23C16 9 48 9 48 23"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M13 24H51L47.4 53.2A5 5 0 0 1 42.4 57.5H21.6A5 5 0 0 1 16.6 53.2Z"
        fill="var(--teal)"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect
        x="10"
        y="19"
        width="44"
        height="8"
        rx="4"
        fill="var(--teal-soft)"
        stroke="var(--ink)"
        strokeWidth="2"
      />
      <path
        d="M36 27H44V38A4 4 0 0 1 36 38Z"
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
