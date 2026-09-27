"use client";

import { createContext, useContext, useEffect } from "react";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { IconButton } from "@/components/icon-button";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_BRAND, type Brand } from "@/lib/branding";
import { inkOn } from "@/lib/color";
import { cn } from "@/lib/utils";

/* The mark from the brand canvas (01 · Logo): a tipped paint bucket, a paint line, one drop. */
const MARK = (
  <>
    <path
      fillRule="evenodd"
      d="M185.5 49 L414 277.5 L263.5 428 A41 41 0 0 1 205.5 428 L84 306.5 A41 41 0 0 1 84 248.5 L204.5 128 L155.5 79 Z M234.5 158 L338.5 262 C326 252 310 246 294 246 C259 246 235 294 200 294 C172 294 148 276 130.5 262 Z"
    />
    <path d="M426.5 297 L463.06 364.83 A41.5 41.5 0 1 1 389.94 364.83 Z" />
  </>
);

const VIOLET = "#6D4AFF";
const BLACK = "#111111";

/**
 * The logo, always one colour: white on a violet panel (primary), all black, or
 * all white. Sized by font size: the mark is 1.12em tall, the gap a quarter of it.
 */
export function Logo({ variant = "primary", className }: { variant?: "primary" | "black" | "white"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.26em] leading-none font-bold tracking-[-0.03em]",
        variant === "primary" && "rounded-[0.4em] px-[0.5em] py-[0.35em]",
        className,
      )}
      style={{
        color: variant === "black" ? BLACK : "#FFFFFF",
        background: variant === "primary" ? VIOLET : undefined,
      }}
    >
      <svg viewBox="68 45 404 399" fill="currentColor" className="h-[1.12em] w-auto shrink-0" aria-hidden="true">
        {MARK}
      </svg>
      Artbucket
    </span>
  );
}

/**
 * The app icon: the white mark on a violet rounded square. Also public/icon.svg.
 * In a span, so a parent's `[&>svg]:size-4` (sidebar and menu items) can't shrink it.
 */
export function AppIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0", className)}>
      <svg viewBox="0 0 512 512" className="size-full" role="img" aria-label="Artbucket">
        <rect width="512" height="512" rx="121" fill={VIOLET} />
        <g transform="translate(256 256) scale(0.8) translate(-270 -244.5)" fill="#FFFFFF">
          {MARK}
        </g>
      </svg>
    </span>
  );
}

/** Light, dark or the system's: the last item in every page's header. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="ghost" label="Theme" className={className}>
          <IconSun className="dark:hidden" />
          <IconMoon className="hidden dark:block" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <IconSun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <IconMoon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <IconDeviceDesktop /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- white-labeling -------------------------------------------------------------

/** What the product is called here and how it looks (lib/branding.ts), from GET /api/v1/branding. */
const BrandContext = createContext<Brand>(DEFAULT_BRAND);
export const useBrand = () => useContext(BrandContext);
export function BrandProvider({ value, children }: { value: Brand; children: React.ReactNode }) {
  return <BrandContext value={value}>{children}</BrandContext>;
}

/**
 * An accent for this page, on the whole document: menus and dialogs render
 * outside the page's tree and would miss it on a wrapper. Share links and
 * portals, whose brand is their organization's, not the visitor's.
 */
export function useAccent(accent: string | null | undefined) {
  useEffect(() => {
    if (!accent) return;
    const root = document.documentElement.style;
    const vars = { "--primary": accent, "--primary-foreground": inkOn(accent), "--ring": accent };
    const before = Object.fromEntries(Object.keys(vars).map((k) => [k, root.getPropertyValue(k)]));
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
    return () => Object.entries(before).forEach(([k, v]) => (v ? root.setProperty(k, v) : root.removeProperty(k)));
  }, [accent]);
}

/**
 * The mark in the sidebar and on sign-in: the organization's logo when it has
 * one, its initial on its accent when it only renamed the product, and the
 * product's own icon when nothing is customized.
 */
export function BrandMark({ brand: given, className }: { brand?: Brand; className?: string }) {
  const context = useBrand();
  const brand = given ?? context;
  if (brand.logo) {
    return (
      // A rendition already sized for this: next/image would only resize it again.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={brand.logo} alt={brand.name} className={cn("h-8 w-auto max-w-[160px] shrink-0 object-contain object-left", className)} />
    );
  }
  if (!brand.custom) return <AppIcon className={className} />;
  const fill = brand.accent ?? "var(--primary)";
  return (
    <span
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold", className)}
      style={{ background: fill, color: brand.accent ? inkOn(brand.accent) : "var(--primary-foreground)" }}
      role="img"
      aria-label={brand.name}
    >
      {brand.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
