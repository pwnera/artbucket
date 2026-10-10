"use client";

import { IconPin, IconPinFilled } from "@tabler/icons-react";
import { IconButton } from "@/components/icon-button";
import { usePins, type Pin } from "@/components/sidebar-prefs";

/** Pin it to the sidebar, or take it off: kept per person, in this browser. */
export function PinButton({ pin, size = "icon-sm" }: { pin: Pin; size?: "icon-xs" | "icon-sm" | "icon" }) {
  const { has, toggle } = usePins();
  const on = has(pin.id);
  return (
    <IconButton variant="outline" size={size} label={on ? `Unpin ${pin.label}` : `Pin ${pin.label} to the sidebar`} aria-pressed={on} onClick={() => toggle(pin)}>
      {on ? <IconPinFilled className="text-primary-ink" /> : <IconPin />}
    </IconButton>
  );
}
