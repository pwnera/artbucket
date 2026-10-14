import type { Metadata } from "next";
import { ImportsPage } from "@/components/imports-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Imports" };

/** The project's brand imports, every one kept as its history (components/imports-page.tsx). */
export default function Imports() {
  return <ImportsPage />;
}
