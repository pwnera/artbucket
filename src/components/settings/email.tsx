"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { IconSend } from "@tabler/icons-react";
import { toast } from "sonner";
import type { Me } from "@/components/account";
import { Confirm } from "@/components/confirm";
import { Group, useLeaveGuard } from "@/components/settings/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ExternalLink } from "@/components/external-link";
import { EMAIL_PROVIDERS, PROVIDERS, type EmailProvider, type EmailSettings } from "@/lib/email";
import { send } from "@/lib/send";

type Source = "workspace" | "organization" | "environment" | "default";
export type EmailSetting = {
  value: EmailSettings;
  secrets: { apiKey: boolean };
  source: Source;
  sources: Partial<Record<keyof EmailSettings, Source>>;
  own: boolean;
};

const FROM: Record<Source, string> = {
  workspace: "set for this workspace",
  organization: "set for this organization",
  environment: "from the server's configuration",
  default: "the default",
};

/**
 * The organization's email: a provider, a sender, a key. Only what is
 * changed here is kept as the organization's own; the rest keeps coming
 * from the server's configuration (EMAIL_*), when it has one. The page
 * remounts it from what the server has after each save or reset, so no
 * stale choice is saved back.
 */
export function EmailPanel({ me, setting }: { me: Me; setting: EmailSetting }) {
  const id = useId();
  const router = useRouter();
  const v = setting.value;
  const [enabled, setEnabled] = useState(v.enabled);
  const [provider, setProvider] = useState<EmailProvider>(v.provider);
  const [from, setFrom] = useState(v.from);
  const [replyTo, setReplyTo] = useState(v.replyTo ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, refresh] = useTransition();
  const p = PROVIDERS[provider];
  const hint = (k: keyof EmailSettings) => (setting.sources[k] && setting.sources[k] !== "default" ? FROM[setting.sources[k]!] : null);

  // Only what changed becomes the organization's own.
  const next = { enabled, provider, from: from.trim(), replyTo: replyTo.trim() || null };
  const patch: Record<string, unknown> = Object.fromEntries(Object.entries(next).filter(([k, x]) => x !== v[k as keyof EmailSettings]));
  if (apiKey.trim()) patch.apiKey = apiKey.trim();
  const dirty = Object.keys(patch).length > 0;
  useLeaveGuard(dirty);

  async function save() {
    if (!dirty) return;
    setBusy(true);
    const saved = await send("PATCH", "/api/v1/settings/email?context=organization", patch);
    setBusy(false);
    if (!saved) return;
    setApiKey("");
    toast.success(saved.value.enabled ? "Email is on" : "Saved; email is off");
    refresh(() => router.refresh());
  }

  async function test(form: FormData) {
    setTesting(true);
    const r = await send("POST", "/api/v1/email/test", { to: String(form.get("to") ?? "").trim() || undefined });
    setTesting(false);
    if (r) toast.success(`Sent to ${r.to}`);
  }

  return (
    <div className="space-y-6">
      <Group
        title="Sending"
        description={
          <>
            <Badge variant={v.enabled ? "default" : "outline"} className="mr-2">
              {v.enabled ? "On" : "Off"}
            </Badge>
            {setting.source === "default"
              ? "Nothing is configured: invitations are links to send yourself, and forgotten passwords can't be reset."
              : `Settings ${FROM[setting.source]}${setting.source === "organization" && Object.values(setting.sources).includes("environment") ? ", the rest from the server's configuration" : ""}.`}
          </>
        }
      >
        <form
          className="grid max-w-lg gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center gap-2">
            <Switch id={`${id}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor={`${id}-enabled`} className="font-normal">
              Send email from {me.workspace.organization.name}
            </Label>
            {enabled !== v.enabled && <span className="text-muted-foreground text-xs">Not saved yet</span>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-provider`}>Provider</Label>
            <Select value={provider} onValueChange={(x) => setProvider(x as EmailProvider)}>
              <SelectTrigger id={`${id}-provider`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_PROVIDERS.map((x) => (
                  <SelectItem key={x} value={x}>
                    {PROVIDERS[x].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Hint text={hint("provider")}>
              {p.site ? (
                <>
                  Make an API key at{" "}
                  <ExternalLink href={p.site} className="underline underline-offset-2">
                    {p.site.replace("https://", "")}
                  </ExternalLink>{" "}
                  and verify the domain you send from.
                </>
              ) : (
                "Messages are printed to the server's log instead of sent: for trying it out."
              )}
            </Hint>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input
              id={`${id}-from`}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder={`${me.workspace.organization.name} <assets@example.com>`}
              maxLength={320}
            />
            <Hint text={hint("from")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-replyTo`}>Reply to</Label>
            {/* Not a login's email: with the key field below, a password manager would take the pair for one. */}
            <Input
              id={`${id}-replyTo`}
              type="email"
              autoComplete="off"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="Optional"
              maxLength={320}
            />
            <Hint text={hint("replyTo")} />
          </div>
          {p.needsKey && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-apiKey`}>API key</Label>
              {/* new-password: Chrome won't fill a saved login into it; the data- attributes keep 1Password and LastPass out. */}
              <Input
                id={`${id}-apiKey`}
                type="password"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={setting.secrets.apiKey ? "Saved. Leave blank to keep it" : "Paste it here"}
                maxLength={500}
              />
              <Hint text={hint("apiKey")}>Kept encrypted, and never shown again.</Hint>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={busy || refreshing} disabled={!dirty}>
              Save
            </Button>
            {setting.own && (
              <Confirm
                title="Use the server's email settings?"
                says="The organization's own provider, sender and saved API key are dropped. Email then follows the server's configuration, or is off if it has none."
                action="Use the server's"
                run={async () => {
                  const ok = await send("DELETE", "/api/v1/settings/email?context=organization");
                  if (!ok) return null;
                  toast.success("Back to the server's settings");
                  refresh(() => router.refresh());
                  return ok;
                }}
              >
                <Button type="button" variant="ghost">
                  Use the server&apos;s settings
                </Button>
              </Confirm>
            )}
          </div>
        </form>
      </Group>

      <Group title="Send a test" description="Through the settings above, as they are saved.">
        <form
          className="grid max-w-lg gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void test(new FormData(e.currentTarget));
          }}
        >
          <div className="flex gap-2">
            <Input name="to" type="email" placeholder={me.user?.email ?? "you@example.com"} aria-label="Send the test to" required={!me.user} />
            <Button type="submit" variant="outline" pending={testing} disabled={!v.enabled} aria-describedby={v.enabled ? undefined : `${id}-test-off`}>
              <IconSend /> Send
            </Button>
          </div>
          {!v.enabled && (
            <p id={`${id}-test-off`} className="text-muted-foreground text-xs">
              Turn email on and save to send a test.
            </p>
          )}
        </form>
      </Group>
    </div>
  );
}

/** Help under a field, and where its value comes from now when that isn't here: "Now from the server's configuration." */
export function Hint({ text, children }: { text: string | null; children?: React.ReactNode }) {
  if (!text && !children) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {children}
      {text && children && " "}
      {text && <span className="italic">Now {text}.</span>}
    </p>
  );
}
