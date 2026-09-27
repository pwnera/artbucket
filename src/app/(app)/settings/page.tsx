import { redirect } from "next/navigation";
import { allowedFor, hrefOf } from "@/components/settings/sections";
import { whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

/** The first section this person may open. */
export default async function Settings() {
  const first = allowedFor(await whoami()).find((s) => !s.href);
  redirect(first ? hrefOf(first) : "/");
}
