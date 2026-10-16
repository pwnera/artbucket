import { redirect } from "next/navigation";

/** Components are Explore's Components tab now, each opening in a panel there; old links land on it. */
export default function ComponentsPage() {
  redirect("/?in=component");
}
