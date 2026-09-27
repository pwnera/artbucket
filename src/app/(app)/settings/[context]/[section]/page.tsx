import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { People, type Members } from "@/components/settings/access";
import { EmailPanel, type EmailSetting } from "@/components/settings/email";
import { FieldsPanel, NameForm, ProfilePanel, WorkspacesPanel } from "@/components/settings/panels";
import { find, opens } from "@/components/settings/sections";
import { SettingsShell } from "@/components/settings/shell";
import type { FieldDef } from "@/lib/fields";
import type { Scope } from "@/lib/scopes";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings - Artbucket" };

type Params = { context: string; section: string };

/**
 * One settings section (components/settings/sections.ts), with what it shows
 * read from /api/v1 like any client's. A section this person may not open
 * sends them to Settings' first.
 */
export default async function SettingsSection({ params }: { params: Promise<Params> }) {
  const { context, section } = await params;
  const s = find(context, section);
  if (!s) notFound();
  const sidebar = await sidebarData();
  const me = sidebar.me;
  if (!opens(me, s)) redirect("/settings");
  const data = <T,>(b: { data: T }) => b.data;
  const ws = me.workspace;

  let body: React.ReactNode;
  switch (`${context}/${section}`) {
    case "workspace/general":
      body = <NameForm what="workspace" url={`/api/v1/workspaces/${ws.id}`} name={ws.name} />;
      break;
    case "workspace/fields":
      body = <FieldsPanel fields={await get("fields", data<FieldDef[]>, [])} />;
      break;
    case "organization/general":
      body = <NameForm what="organization" url={`/api/v1/organizations/${ws.organization.id}`} name={ws.organization.name} />;
      break;
    case "workspace/members": {
      const members = await get("members?in=workspace", (b: Members) => b, null);
      body = members && <People me={me} members={members} collections={sidebar.collections} view="workspace" />;
      break;
    }
    case "organization/workspaces":
      body = <WorkspacesPanel me={me} workspaces={await get("workspaces", data<{ id: string; slug: string; name: string; scope: Scope | null }[]>, [])} />;
      break;
    case "organization/email": {
      const all = await get("settings?context=organization", data<(EmailSetting & { key: string })[]>, []);
      const email = all.find((x) => x.key === "email");
      body = email && <EmailPanel me={me} setting={email} />;
      break;
    }
    case "account/profile":
      body = <ProfilePanel me={me} passwordReset={me.auth.passwordReset} />;
      break;
  }
  return (
    <SettingsShell sidebar={sidebar} at={{ context, id: section }}>
      {body}
    </SettingsShell>
  );
}
