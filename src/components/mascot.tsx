/**
 * Pip - a Bucket-Teal paint bucket with a heap of coral paint, one drip, blush
 * cheeks and a 2px outline. Drawn from tokens so it follows the theme.
 *
 * Appears ONLY in empty states (idle), onboarding and success (happy), and
 * long loads or no-results (sleepy). Never in the grid, on a card, in a button,
 * in nav, or beside a user's artwork. One Pip per screen.
 */
export function Mascot({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Pip" className={className}>
      <path d="M16 23C16 9 48 9 48 23" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M13 24H51L47.4 53.2A5 5 0 0 1 42.4 57.5H21.6A5 5 0 0 1 16.6 53.2Z"
        fill="var(--teal)"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M20 20Q20.5 12 27.5 12.5Q32 8.5 37 12.5Q43.5 12 44 20Z"
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="10" y="19" width="44" height="8" rx="4" fill="var(--teal-soft)" stroke="var(--ink)" strokeWidth="2" />
      <path
        d="M40 27H46V33A3 3 0 0 1 40 33Z"
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Blush and eye highlights stay literal: they sit on Pip's own body, not on a theme surface. */}
      <ellipse cx="21.5" cy="45.5" rx="2.6" ry="1.6" fill="#f6b3a3" />
      <ellipse cx="42.5" cy="45.5" rx="2.6" ry="1.6" fill="#f6b3a3" />
      <circle cx="26" cy="40" r="2.4" fill="var(--ink)" />
      <circle cx="38" cy="40" r="2.4" fill="var(--ink)" />
      <circle cx="26.8" cy="39.2" r="0.8" fill="var(--surface-raised)" />
      <circle cx="38.8" cy="39.2" r="0.8" fill="var(--surface-raised)" />
      <path d="M30 45Q32 47 34 45" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The paint drip - the system's only decorative shape. One per placement, at
 * most one placement per screen. Never on cards, buttons, the grid or toasts.
 */
export function Drip({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={(size * 56) / 48} viewBox="0 0 48 56" aria-hidden className={className}>
      <path d="M0 0H48C38 0 32 4 32 14V44A8 8 0 0 1 16 44V14C16 4 10 0 0 0Z" fill="var(--teal)" />
    </svg>
  );
}
