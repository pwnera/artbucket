import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { People, type Members } from "@/components/settings/access";
import { BrandingPanel, DomainsPanel, type BrandingSetting, type Domain } from "@/components/settings/branding";
import { EmailPanel, type EmailSetting } from "@/components/settings/email";
import { DeleteOrganization, FieldsPanel, NameForm, ProfilePanel, UsagePanel, WorkspacesPanel, type Usage } from "@/components/settings/panels";
import { find, opens } from "@/components/settings/sections";
import { SettingsShell } from "@/components/settings/shell";
import type { FieldDef } from "@/lib/fields";
import type { Scope } from "@/lib/scopes";
import { get, sidebarData } from "@/lib/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

type Params = { context: string; section: string };

/** The API path each section reads, by `{context}/{section}`. */
const LOADS: Record<string, string> = {
  "workspace/fields": "fields",
  "workspace/members": "members?in=workspace",
  "organization/usage": "usage",
  "organization/workspaces": "workspaces",
  "organization/email": "settings?context=organization",
  "organization/branding": "settings?context=organization",
  "organization/domains": "domains",
};

/**
 * One settings section (components/settings/sections.ts), with what it shows
 * read from /api/v1 like any client's. A section this person may not open
 * sends them to Settings' first.
 */
export default async function SettingsSection({ params }: { params: Promise<Params> }) {
  const { context, section } = await params;
  const s = find(context, section);
  if (!s) notFound();
  // What the section reads, fetched alongside the sidebar: the API checks access itself, and a redirect drops it.
  const loading = LOADS[`${context}/${section}`];
  const [sidebar, loaded] = await Promise.all([sidebarData(), loading ? get(loading, (b: unknown) => b, null) : null]);
  const me = sidebar.me;
  if (!opens(me, s)) redirect("/settings");
  const data = <T,>(b: { data: T }) => b.data;
  const ws = me.workspace;
  const fetched = <B, T>(pick: (b: B) => T, fallback: T) => (loaded ? pick(loaded as B) : fallback);

  let body: React.ReactNode;
  switch (`${context}/${section}`) {
    case "workspace/general":
      body = <NameForm what="workspace" url={`/api/v1/workspaces/${ws.id}`} name={ws.name} />;
      break;
    case "workspace/fields":
      body = <FieldsPanel fields={fetched(data<FieldDef[]>, [])} />;
      break;
    case "organization/general":
      body = (
        <div className="space-y-6">
          <NameForm what="organization" url={`/api/v1/organizations/${ws.organization.id}`} name={ws.organization.name} />
          <DeleteOrganization me={me} />
        </div>
      );
      break;
    case "organization/usage": {
      const usage = fetched(data<Usage>, null);
      body = usage && <UsagePanel usage={usage} />;
      break;
    }
    case "workspace/members": {
      const members = fetched((b: Members) => b, null);
      body = members && <People me={me} members={members} collections={sidebar.collections} view="workspace" />;
      break;
    }
    case "organization/workspaces":
      body = <WorkspacesPanel me={me} workspaces={fetched(data<{ id: string; slug: string; name: string; scope: Scope | null }[]>, [])} />;
      break;
    case "organization/email": {
      const all = fetched(data<(EmailSetting & { key: string })[]>, []);
      const email = all.find((x) => x.key === "email");
      body = email && <EmailPanel me={me} setting={email} />;
      break;
    }
    case "organization/branding": {
      const all = fetched(data<(BrandingSetting & { key: string })[]>, []);
      const branding = all.find((x) => x.key === "branding");
      body = branding && <BrandingPanel setting={branding} />;
      break;
    }
    case "organization/domains":
      body = <DomainsPanel domains={fetched(data<Domain[]>, [])} />;
      break;
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
