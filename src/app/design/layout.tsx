import { notFound } from "next/navigation";

/** The living reference for contributors: served while developing, not to users. */
export default function DesignLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
