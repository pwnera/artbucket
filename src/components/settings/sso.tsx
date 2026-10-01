"use client";

import { useRouter } from "next/navigation";
import { Fragment, useId, useState } from "react";
import { IconCheck, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { InfoTip } from "@/components/info-tip";
import { Group } from "@/components/settings/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { send } from "@/lib/send";

export type Sso = {
  issuer: string;
  clientId: string;
  domain: string;
  verified: boolean;
  required: boolean;
  record: { type: "TXT"; name: string; value: string };
  redirectUri: string;
};

/** A value to copy into the provider or the DNS host: its label, the value, and a copy button in its own column. */
export function Values({ rows }: { rows: [label: string, value: string, what: string][] }) {
  return (
    <dl className="bg-muted/50 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md p-2.5 text-xs">
      {rows.map(([label, value, what]) => (
        <Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono break-all">{value}</dd>
          <CopyButton text={value} label={`Copy ${what}`} what={what} />
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * The organization's own single sign-on (lib/core/sso.ts): register the app
 * with the provider, save its client here, prove the email domain. The page
 * remounts it from what the server has after each save.
 */
export function SsoPanel({ sso, redirectUri }: { sso: Sso | null; redirectUri: string }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState<"save" | "check" | "optional" | null>(null);

  async function save(form: FormData) {
    const clientSecret = String(form.get("clientSecret") ?? "");
    setBusy("save");
    const ok = await send("PUT", "/api/v1/sso", {
      issuer: String(form.get("issuer") ?? "").trim(),
      clientId: String(form.get("clientId") ?? "").trim(),
      ...(clientSecret ? { clientSecret } : {}),
      domain: String(form.get("domain") ?? "").trim(),
    });
    setBusy(null);
    if (!ok) return;
    toast.success(sso ? "Single sign-on saved" : "Single sign-on set up", sso?.verified ? undefined : { description: "Add the TXT record, then check it." });
    router.refresh();
  }

  async function check() {
    setBusy("check");
    const ok = await send("POST", "/api/v1/sso/verify");
    setBusy(null);
    if (!ok) return;
    toast.success(`People at ${sso?.domain} sign in with single sign-on now`);
    router.refresh();
  }

  async function require(required: boolean) {
    if (!required) setBusy("optional");
    const ok = await send("PATCH", "/api/v1/sso", { required });
    setBusy(null);
    if (!ok) return null;
    toast.success(required ? `People at ${sso?.domain} sign in only with single sign-on now` : `People at ${sso?.domain} may use a password again`);
    router.refresh();
    return ok;
  }

  return (
    <div className="space-y-6">
      <Group
        title="Single sign-on"
        description="Okta, Entra ID, Google Workspace or any OpenID Connect provider."
        info="Your people sign in with their work email. The first time, they join the organization able to read; raise anyone's access in Team."
      >
        <div className="grid gap-2 text-sm">
          <p>
            1. At your provider, make a web app (OpenID Connect) with this redirect URI:{" "}
            <InfoTip label="Google Workspace and Entra ID">
              Google Workspace: an OAuth client of type Web application, issuer https://accounts.google.com, and an Internal consent screen. Entra ID: an app
              registration with a Web redirect URI, issuer https://login.microsoftonline.com/&#123;tenant&#125;/v2.0.
            </InfoTip>
          </p>
          <Values rows={[["Redirect URI", sso?.redirectUri ?? redirectUri, "the redirect URI"]]} />
        </div>
        <form
          className="grid max-w-md gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(new FormData(e.currentTarget));
          }}
        >
          <p className="text-sm">2. Save what the provider gave you:</p>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-issuer`}>Issuer URL</Label>
            <Input id={`${id}-issuer`} name="issuer" type="url" required defaultValue={sso?.issuer} placeholder="https://acme.okta.com" autoComplete="off" spellCheck={false} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-client`}>Client ID</Label>
            <Input id={`${id}-client`} name="clientId" required defaultValue={sso?.clientId} autoComplete="off" spellCheck={false} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-secret`}>Client secret</Label>
            <Input
              id={`${id}-secret`}
              name="clientSecret"
              type="password"
              required={!sso}
              placeholder={sso ? "Kept: type a new one to change it" : undefined}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`${id}-domain`}>Email domain</Label>
              <InfoTip>Whoever signs in with an address there, or under it, goes through your provider.</InfoTip>
            </div>
            <Input
              id={`${id}-domain`}
              name="domain"
              required
              defaultValue={sso?.domain}
              placeholder="acme.com"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${id}-domain-hint`}
            />
            <p id={`${id}-domain-hint`} className="text-muted-foreground text-xs">
              Joins your email domains, proved once for both.
            </p>
          </div>
          <Button type="submit" className="justify-self-start" pending={busy === "save"} disabled={busy === "check"}>
            {sso ? "Save" : "Set up"}
          </Button>
        </form>
        {sso && (
          <div className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1">3. Prove {sso.domain} is yours with this TXT record:</p>
              {sso.verified ? (
                <Badge variant="success">
                  <IconCheck /> Verified
                </Badge>
              ) : (
                <Button size="sm" variant="outline" pending={busy === "check"} disabled={busy === "save"} onClick={() => void check()}>
                  Check now
                </Button>
              )}
            </div>
            {!sso.verified && (
              <Values
                rows={[
                  ["TXT", sso.record.name, "the TXT name"],
                  ["Value", sso.record.value, "the TXT value"],
                ]}
              />
            )}
            <p className="text-muted-foreground text-xs text-pretty">
              {sso.verified
                ? `People at ${sso.domain} are sent to it from the sign-in page.`
                : "Off until the record is found. DNS can take a few minutes."}
            </p>
          </div>
        )}
      </Group>
      {sso?.verified && (
        <Group
          title="Require single sign-on"
          description={`Nobody at ${sso.domain} but the organization's admins signs in with a password.`}
          info={`Nor resets one: leaving your provider leaves Artbucket. Admins keep their password, so a provider that breaks never locks you out. People outside ${sso.domain} are not affected.`}
        >
          <div className="flex flex-wrap items-center gap-3">
            {sso.required ? (
              <>
                <Badge variant="success">
                  <IconCheck /> Required
                </Badge>
                <Button size="sm" variant="outline" pending={busy === "optional"} onClick={() => void require(false)}>
                  Allow passwords again
                </Button>
              </>
            ) : (
              <Confirm
                title="Require single sign-on?"
                says={`Everyone at ${sso.domain} but the organization's admins is signed out now, and signs in again through your provider.`}
                action="Require it"
                run={() => require(true)}
              >
                <Button size="sm" variant="outline">
                  Require single sign-on
                </Button>
              </Confirm>
            )}
          </div>
        </Group>
      )}
      {sso && (
        <Group title="Turn off single sign-on" tone="danger" description="People keep their accounts and access, and sign in with a password.">
          <Confirm
            title="Turn off single sign-on?"
            says={`People at ${sso.domain} will sign in with a password instead.`}
            action="Turn off"
            run={async () => {
              const ok = await send("DELETE", "/api/v1/sso");
              if (!ok) return null;
              toast.success("Single sign-on is off");
              router.refresh();
              return ok;
            }}
          >
            <Button variant="outline" className="text-destructive">
              <IconTrash /> Turn off
            </Button>
          </Confirm>
        </Group>
      )}
    </div>
  );
}
