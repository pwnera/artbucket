"use client";

import { IconBucketDroplet, IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { IconButton } from "@/components/icon-button";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** The mark: Tabler's tipped paint bucket on a primary tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg",
        className,
      )}
    >
      {/* The mark keeps its full weight: a stroke of 2 is the logo, not the icon default. */}
      <IconBucketDroplet className="size-5" style={{ strokeWidth: 2 }} />
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
