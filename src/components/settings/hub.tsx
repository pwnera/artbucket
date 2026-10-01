"use client";

import { Fragment, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBrandGithub, IconCheck, IconCircleCheckFilled, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import type { Domain } from "@/components/settings/branding";
import { Group } from "@/components/settings/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink } from "@/components/external-link";
import { OffersGroup, type HubOffer } from "@/components/hub-offers";
import { ago, REPORT_REASONS } from "@/lib/hub";
import { send } from "@/lib/send";

/** GET /api/v1/github-orgs. */
export type GithubAccount = { login: string; verified: boolean; url: string; file: { repository: string; path: string; url: string; token: string } };
/** GET /api/v1/hub/reports. */
export type HubReport = {
  id: string;
  kind: "report" | "claim";
  reason: string;
  note: string | null;
  contact: string | null;
  claimant: { name: string; proof: string | null } | null;
  status: "open" | "resolved";
  createdAt: string;
  brand: { slug: string; name: string; workspace: string; visibility: "private" | "public" };
};

/**
 * The organization on BrandHub (lib/core/hub-trust.ts), as the prototype's
 * listing page has it: whether its listings are verified and by what, the
 * listings of others its verified domains claim, the GitHub accounts that
 * prove it is who its listings say, beside its domains, and what people
 * reported or claimed about its listings, to act on.
 */
export function HubPanel({
  github,
  reports,
  domains,
  offers,
}: {
  github: GithubAccount[];
  reports: HubReport[];
  domains: Pick<Domain, "host" | "verified">[];
  offers: HubOffer[];
}) {
  return (
    <div className="space-y-6">
      <Verified proofs={[...domains.filter((d) => d.verified).map((d) => `DNS TXT record on ${d.host}`), ...github.filter((g) => g.verified).map((g) => `GitHub organization github.com/${g.login}`)]} />
      {domains.some((d) => d.verified) && <OffersGroup offers={offers} />}
      <GithubAccounts github={github} />
      <Reports reports={reports} />
    </div>
  );
}

/** Whether its public listings show as verified, and each proof that makes them so. */
function Verified({ proofs }: { proofs: string[] }) {
  return (
    <Group
      title={proofs.length ? "Listings verified" : "Listings"}
      description={proofs.length ? undefined : "Community listings until you prove a domain or GitHub account."}
      info="Verified listings name their proof. Anyone can report a listing, and an organization that proves it holds the brand can claim it. Listings that are not verified stay out of search engines."
    >
      {proofs.length ? (
        <ul className="grid gap-1.5 text-sm">
          {proofs.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <IconCircleCheckFilled aria-hidden className="text-success size-4 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      ) : (
        <Badge variant="outline">Community</Badge>
      )}
    </Group>
  );
}

function GithubAccounts({ github }: { github: GithubAccount[] }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const verify = async (login: string) => {
    setBusy((b) => ({ ...b, [login]: true }));
    const ok = await send("POST", `/api/v1/github-orgs/${encodeURIComponent(login)}/verify`);
    setBusy((b) => ({ ...b, [login]: false }));
    if (!ok) return;
    toast.success(`github.com/${login} is verified`);
    router.refresh();
  };
  return (
    <Group
      title="GitHub accounts"
      description="Verify your listings with a GitHub organization."
      info="Proved like a domain: add a file to the account's .github repository, then check it. Its BrandHub listings then show as verified."
    >
      {github.length > 0 && (
        <ul className="divide-y rounded-md border">
          {github.map((g) => (
            <li key={g.login} className="grid gap-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <IconBrandGithub aria-hidden className="text-muted-foreground size-4" />
                <ExternalLink href={g.url} className="min-w-48 flex-1 truncate font-medium hover:underline">
                  github.com/{g.login}
                </ExternalLink>
                {g.verified ? (
                  <Badge variant="success">
                    <IconCheck /> Verified
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" pending={busy[g.login]} onClick={() => verify(g.login)}>
                    Check now
                  </Button>
                )}
                <Confirm
                  title={`Remove github.com/${g.login}?`}
                  says="It no longer proves your listings on BrandHub."
                  action="Remove"
                  run={async () => {
                    const ok = await send("DELETE", `/api/v1/github-orgs/${encodeURIComponent(g.login)}`);
                    if (!ok) return null;
                    toast.success(`Removed github.com/${g.login}`);
                    router.refresh();
                    return ok;
                  }}
                >
                  <IconButton variant="ghost" label={`Remove github.com/${g.login}`} className="text-muted-foreground hover:text-destructive">
                    <IconTrash />
                  </IconButton>
                </Confirm>
              </div>
              {!g.verified && (
                <div className="bg-muted/50 grid gap-2 rounded-md p-2.5 text-xs">
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                    {(
                      [
                        ["Repository", g.file.repository, "the repository"],
                        ["File", g.file.path, "the file name"],
                        ["Holding", g.file.token, "the token"],
                      ] as const
                    ).map(([label, value, what]) => (
                      <Fragment key={label}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono break-all">{value}</dd>
                        <CopyButton text={value} label={`Copy ${what}`} what={what} />
                      </Fragment>
                    ))}
                  </dl>
                  <p className="text-muted-foreground">
                    On the repository&apos;s default branch. No{" "}
                    <ExternalLink href={g.file.url} className="underline underline-offset-2">
                      .github repository
                    </ExternalLink>{" "}
                    yet? Make one, public.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex max-w-md items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const login = String(new FormData(form).get("login") ?? "").trim();
          if (!login) return;
          setAdding(true);
          const ok = await send("POST", "/api/v1/github-orgs", { login });
          setAdding(false);
          if (!ok) return;
          toast.success(`Added github.com/${ok.login}`, { description: "Add its file, then check it." });
          form.reset();
          router.refresh();
        }}
      >
        <div className="grid flex-1 gap-2">
          <Label htmlFor={id}>Add a GitHub account</Label>
          <Input id={id} name="login" placeholder="rust-lang" autoCapitalize="none" autoComplete="off" spellCheck={false} />
        </div>
        <Button type="submit" variant="outline" pending={adding}>
          <IconPlus /> Add
        </Button>
      </form>
    </Group>
  );
}

function Reports({ reports }: { reports: HubReport[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (r: HubReport, patch: { status?: "open" | "resolved"; delist?: true }, done: string) => {
    setBusy(r.id);
    const ok = await send("PATCH", `/api/v1/hub/reports/${r.id}`, patch);
    setBusy(null);
    if (!ok) return;
    toast.success(done);
    router.refresh();
  };
  return (
    <Group
      title="Reports and claims"
      description="What people said about your public listings."
      info="A claim comes from an organization that proved a domain or a GitHub account: reach them, then hand the brand over (they can start from it on BrandHub) or take the listing down. This server's operator sees these too."
    >
      {reports.length ? (
        <ul className="divide-y rounded-md border">
          {reports.map((r) => (
            <li key={r.id} className="grid gap-1.5 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.kind === "claim" ? "warning" : "outline"}>{r.kind === "claim" ? "Claim" : "Report"}</Badge>
                <span className="font-medium">{r.brand.name}</span>
                <span className="text-muted-foreground text-xs">
                  {r.brand.workspace}, {ago(r.createdAt)}
                </span>
                {r.status === "resolved" && <Badge variant="success">Resolved</Badge>}
                <span className="ms-auto flex gap-1">
                  {r.brand.visibility === "public" && (
                    <Button size="sm" variant="outline" pending={busy === r.id} onClick={() => act(r, { delist: true, status: "resolved" }, `${r.brand.name} is off BrandHub`)}>
                      Take off BrandHub
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    pending={busy === r.id}
                    onClick={() => act(r, { status: r.status === "open" ? "resolved" : "open" }, r.status === "open" ? "Marked resolved" : "Opened again")}
                  >
                    {r.status === "open" ? "Resolve" : "Reopen"}
                  </Button>
                </span>
              </div>
              <p>
                {r.claimant
                  ? `${r.claimant.name} says it is their brand${r.claimant.proof ? `, and proved it holds ${r.claimant.proof}` : ""}.`
                  : (REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason)}
              </p>
              {r.note && <p className="text-muted-foreground whitespace-pre-line">{r.note}</p>}
              {r.contact && <p className="text-muted-foreground text-xs">Reach them: {r.contact}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Nothing yet.</p>
      )}
    </Group>
  );
}
