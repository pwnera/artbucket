import { permanentRedirect } from "next/navigation";

/** The Agents page became Connections: its old address still gets there. */
export default function AgentsPage() {
  permanentRedirect("/connections");
}
