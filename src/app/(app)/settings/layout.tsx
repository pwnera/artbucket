import { SettingsShell } from "@/components/settings/shell";

/** Settings' menu and header stay while a section loads: only the pane beside them swaps ([section]/loading.tsx). */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
