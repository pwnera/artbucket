"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PageView } from "@/lib/site";

/**
 * The reader's language, from the theme's list (build spec 3.4 item 10). A
 * pick puts `?lang=` in the address and the host fetches the page in it
 * through `onNavigate`, as a link in the site does; without one the page
 * loads again. Nothing shows with fewer than two. Each name is marked as its
 * own language, so it is read and spoken as written.
 */
export function LanguageSwitch({
  view,
  onNavigate,
  className,
}: {
  view: Pick<PageView, "lang" | "theme">;
  onNavigate?: (href: string) => void;
  className?: string;
}) {
  const languages = view.theme.settings.languages ?? [];
  if (languages.length < 2) return null;
  const current = languages.find((l) => l.code === view.lang) ?? languages[0];

  const pick = (code: string) => {
    const u = new URL(location.href);
    // The first is the one the pages are written in: no ?lang= reads it.
    if (code === languages[0].code) u.searchParams.delete("lang");
    else u.searchParams.set("lang", code);
    // A context the old language chose (locales as contexts, ar for ar-eg too) goes with it.
    const was = current.code;
    if ([was, was.split("-")[0]].includes(u.searchParams.get("context") ?? "")) u.searchParams.delete("context");
    const to = u.pathname + u.search + u.hash;
    if (onNavigate) onNavigate(to);
    else window.location.assign(to);
  };

  return (
    <Select value={current.code} onValueChange={pick}>
      <SelectTrigger size="sm" aria-label="Language" className={className}>
        {/* Its name as children, so the server draws it too, not only the hydrated select. */}
        <SelectValue lang={current.code}>{current.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {languages.map((l) => (
          <SelectItem key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
