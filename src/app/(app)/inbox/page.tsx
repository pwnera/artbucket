import { redirect } from "next/navigation";

/** The Inbox is Review, Fixes and Imports, one tab each: it opens on Review. */
export default function InboxPage() {
  redirect("/review");
}
