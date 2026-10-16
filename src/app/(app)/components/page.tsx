import { redirect } from "next/navigation";

/** Components are the library's Components tab now, each opening in a panel there; old links land on it. */
export default function ComponentsPage() {
  redirect("/assets?in=component");
}
