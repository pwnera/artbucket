import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { People, type Members } from "@/components/settings/access";
import { BrandingPanel, DomainsPanel, type BrandingSetting, type Domain } from "@/components/settings/branding";
import { EmailPanel, type EmailSetting } from "@/components/settings/email";
import type { HubOffer } from "@/components/hub-offers";
import { HubPanel, type GithubAccount, type HubReport } from "@/components/settings/hub";
import { EmailDomainsPanel, type EmailDomain } from "@/components/settings/email-domains";
import { SsoPanel, type Sso } from "@/components/settings/sso";
import { DeleteOrganization, FieldsPanel, LoadFailed, NameForm, ProfilePanel, UsagePanel, WorkspacesPanel, type Usage } from "@/components/settings/panels";
import { find, has, locked, opens } from "@/components/settings/sections";
import type { FieldDef } from "@/lib/fields";
import type { Scope } from "@/lib/scopes";
import type { Collection } from "@/components/collections";
import { get, whoami } from "@/lib/sidebar";

export const dynamic = "force-dynamic";

type Params = { context: string; section: string };

/** Each section its own title, so tabs and history tell Members from Domains. */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { context, section } = await params;
  const s = find(context, section);
  return { title: s ? `${s.label} · Settings` : "Settings" };
}

/** The API path each section reads, by `{context}/{section}`. */
const LOADS: Record<string, string> = {
  "workspace/fields": "fields",
  "workspace/members": "members?in=workspace",
  "organization/usage": "usage",
  "organization/workspaces": "workspaces",
  "organization/email": "settings?context=organization",
  "organization/branding": "settings?context=organization",
  "organization/hub": "github-orgs",
  "organization/domains": "email-domains",
  "organization/sso": "sso",
};

/**
 * One settings section (components/settings/sections.ts), with what it shows
 * read from /api/v1 like any client's; the menu and header around it are the
 * layout's. A section this person may not open sends them to Settings' first.
 */
export default async function SettingsSection({ params }: { params: Promise<Params> }) {
  const { context, section } = await params;
  const s = find(context, section);
  if (!s) notFound();
  // A page of its own elsewhere (Team): the menu links there, and so does this URL.
  if (s.href) redirect(s.href);
  // What the section reads, fetched alongside who is looking: the API checks access itself, and a redirect drops it.
  const loading = LOADS[`${context}/${section}`];
  const forMembers = `${context}/${section}` === "workspace/members";
  const forHub = `${context}/${section}` === "organization/hub";
  const forDomains = `${context}/${section}` === "organization/domains";
  const [me, loaded, collections, reports, domains, offers] = await Promise.all([
    whoami(),
    loading ? get(loading, (b: unknown) => b, null) : null,
    // What a member's access can be scoped to.
    forMembers ? get("collections", (b: { data: Collection[] }) => b.data, []) : [],
    // BrandHub's second read, beside its GitHub accounts.
    forHub ? get("hub/reports", (b: { data: HubReport[] }) => b.data, null) : [],
    // And its domains: a verified one proves its listings as a GitHub account does.
    // Domains reads them too, beside its email domains: null there is a failed read.
    forHub || forDomains ? get("domains", (b: { data: Domain[] }) => b.data, forDomains ? null : []) : [],
    // And the listings those domains claim.
    forHub ? get("hub/offers", (b: { data: HubOffer[] }) => b.data, []) : [],
  ]);
  if (!opens(me, s)) redirect("/settings");
  // Its feature is off here: the plan that has it, or Settings' first when there is none to take.
  if (locked(me, s)) redirect(me.upgrade ?? "/settings");
  // Failed, not empty: "No custom fields yet" would invite making them all again.
  if (loading && loaded === null) return <LoadFailed />;
  const data = <T,>() => (loaded as { data: T }).data;
  const ws = me.workspace;

  switch (`${context}/${section}`) {
    case "workspace/general":
      return <NameForm what="workspace" url={`/api/v1/workspaces/${ws.id}`} name={ws.name} />;
    case "workspace/fields":
      return <FieldsPanel fields={data<FieldDef[]>()} />;
    case "organization/general":
      return (
        <div className="space-y-6">
          <NameForm what="organization" url={`/api/v1/organizations/${ws.organization.id}`} name={ws.organization.name} />
          <DeleteOrganization me={me} />
        </div>
      );
    case "organization/usage":
      return <UsagePanel usage={data<Usage>()} />;
    case "workspace/members":
      return (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            The whole organization, links and audit log are in{" "}
            <Link href="/team" className="text-foreground underline underline-offset-2">
              Team
            </Link>
            .
          </p>
          <People me={me} members={loaded as Members} collections={collections} view="workspace" />
        </div>
      );
    case "organization/workspaces":
      return <WorkspacesPanel me={me} workspaces={data<{ id: string; slug: string; name: string; scope: Scope | null }[]>()} />;
    case "organization/email": {
      const email = data<(EmailSetting & { key: string })[]>().find((x) => x.key === "email");
      // Keyed by what the server has: after a save or a reset the form starts from it, not from stale choices.
      return email ? <EmailPanel key={JSON.stringify([email.value, email.own])} me={me} setting={email} /> : <LoadFailed />;
    }
    case "organization/branding": {
      const branding = data<(BrandingSetting & { key: string })[]>().find((x) => x.key === "branding");
      return branding ? <BrandingPanel key={JSON.stringify([branding.value, branding.own])} setting={branding} /> : <LoadFailed />;
    }
    case "organization/domains":
      // The web half where the plan has it, else the way to one; email domains are everyone's.
      return (
        <div className="space-y-6">
          {has(me, "domains") ? (
            domains ? <DomainsPanel domains={domains} /> : <LoadFailed />
          ) : (
            me.upgrade && (
              <p className="text-muted-foreground text-sm">
                Addresses of your own for the app and portals are on a paid plan.{" "}
                <a href={me.upgrade} className="text-foreground underline underline-offset-2">
                  Upgrade
                </a>
              </p>
            )
          )}
          <EmailDomainsPanel domains={data<EmailDomain[]>()} />
        </div>
      );
    case "organization/hub":
      return reports ? <HubPanel github={data<GithubAccount[]>()} reports={reports} domains={domains ?? []} offers={offers} /> : <LoadFailed />;
    case "organization/billing":
      redirect(me.billing!);
    case "organization/sso": {
      const { data: sso, redirectUris } = loaded as { data: Sso | null; redirectUris: string[] };
      // Keyed by what the server has: after a save the form starts from it.
      return <SsoPanel key={JSON.stringify(sso)} sso={sso} redirectUris={redirectUris} />;
    }
    case "account/profile":
      return <ProfilePanel me={me} passwordReset={me.auth.passwordReset} />;
  }
  return null;
}
