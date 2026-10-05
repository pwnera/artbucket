"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { IconButton } from "@/components/icon-button";
import { Group } from "@/components/settings/panels";
import { Landing, Values, type Workspace } from "@/components/settings/sso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { send } from "@/lib/send";

export type EmailDomain = {
  domain: string;
  verified: boolean;
  join: boolean;
  workspaceId: string | null;
  sso: boolean;
  record: { type: "TXT"; name: string; value: string };
};

/**
 * The domains the organization's people have their email at
 * (lib/core/email-domains.ts), each proved by a TXT record. Single sign-on
 * uses one; joining by domain opens one.
 */
export function EmailDomainsPanel({ domains, workspaces }: { domains: EmailDomain[]; workspaces: Workspace[] }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function join(domain: string, on: boolean) {
    setBusy(domain);
    const ok = await send("PATCH", `/api/v1/email-domains/${encodeURIComponent(domain)}`, { join: on });
    setBusy(null);
    if (!ok) return;
    toast.success(on ? `Anyone at ${domain} can join now` : `Nobody joins from ${domain} by itself now`);
    router.refresh();
  }

  async function land(domain: string, workspaceId: string) {
    setBusy(domain);
    const ok = await send("PATCH", `/api/v1/email-domains/${encodeURIComponent(domain)}`, { workspaceId });
    setBusy(null);
    if (!ok) return;
    toast.success(`People joining from ${domain} land in ${workspaces.find((w) => w.id === workspaceId)?.name} now`);
    router.refresh();
  }

  async function check(domain: string) {
    setBusy(domain);
    const ok = await send("POST", `/api/v1/email-domains/${encodeURIComponent(domain)}/verify`);
    setBusy(null);
    if (!ok) return;
    toast.success(`${domain} is verified`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Group
        title="Email domains"
        description="Where your people have their email, e.g. acme.com."
        info="Prove each with a TXT record: single sign-on uses one, and you can let anyone at one join, able to read one workspace, once their email is confirmed. Not addresses for the app or portals: those are in Domains."
      >
        {domains.length > 0 && (
          <ul className="divide-y rounded-md border">
            {domains.map((d) => (
              <li key={d.domain} className="grid gap-2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-48 flex-1 truncate font-medium" title={d.domain}>
                    {d.domain}
                  </span>
                  {d.sso && <Badge variant="outline">Single sign-on</Badge>}
                  {d.verified ? (
                    <Badge variant="success">
                      <IconCheck /> Verified
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" pending={busy === d.domain} onClick={() => void check(d.domain)}>
                      Check now
                    </Button>
                  )}
                  {!d.sso && (
                    <Confirm
                      title={`Remove ${d.domain}?`}
                      says="Nobody loses access. Proving it again takes a new TXT record."
                      action="Remove"
                      run={async () => {
                        const ok = await send("DELETE", `/api/v1/email-domains/${encodeURIComponent(d.domain)}`);
                        if (!ok) return null;
                        toast.success(`Removed ${d.domain}`);
                        router.refresh();
                        return ok;
                      }}
                    >
                      <IconButton variant="ghost" label={`Remove ${d.domain}`} className="text-muted-foreground hover:text-destructive">
                        <IconTrash />
                      </IconButton>
                    </Confirm>
                  )}
                </div>
                {d.verified && !d.sso && (
                  <div className="flex items-center gap-2">
                    <Switch id={`${id}-${d.domain}`} checked={d.join} disabled={busy === d.domain} onCheckedChange={(on) => void join(d.domain, on)} />
                    <Label htmlFor={`${id}-${d.domain}`} className="font-normal">
                      Anyone at {d.domain} can join, able to read
                    </Label>
                  </div>
                )}
                {d.verified && !d.sso && d.join && workspaces.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={`${id}-${d.domain}-landing`} className="font-normal">
                      They land in
                    </Label>
                    <Landing
                      id={`${id}-${d.domain}-landing`}
                      workspaces={workspaces}
                      value={d.workspaceId}
                      disabled={busy === d.domain}
                      onChange={(w) => void land(d.domain, w)}
                    />
                    <span className="text-muted-foreground text-xs">and read that workspace only</span>
                  </div>
                )}
                {!d.verified && (
                  <Values
                    rows={[
                      ["TXT", d.record.name, "the TXT name"],
                      ["Value", d.record.value, "the TXT value"],
                    ]}
                  />
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
            const domain = String(new FormData(form).get("domain") ?? "").trim();
            if (!domain) return;
            setBusy("add");
            const ok = await send("POST", "/api/v1/email-domains", { domain });
            setBusy(null);
            if (!ok) return;
            toast.success(`Added ${domain}`, { description: "Add its TXT record, then check it." });
            form.reset();
            router.refresh();
          }}
        >
          <div className="grid flex-1 gap-2">
            <Label htmlFor={id}>Add an email domain</Label>
            <Input id={id} name="domain" placeholder="acme.com" autoCapitalize="none" autoComplete="off" spellCheck={false} />
          </div>
          <Button type="submit" variant="outline" pending={busy === "add"}>
            <IconPlus /> Add
          </Button>
        </form>
      </Group>
    </div>
  );
}
