"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconSend } from "@tabler/icons-react";
import { toast } from "sonner";
import type { Me } from "@/components/account";
import { send } from "@/components/collections";
import { Group } from "@/components/settings/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EMAIL_PROVIDERS, PROVIDERS, type EmailProvider, type EmailSettings } from "@/lib/email";

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
 * from the server's configuration (EMAIL_*), when it has one.
 */
export function EmailPanel({ me, setting }: { me: Me; setting: EmailSetting }) {
  const id = useId();
  const router = useRouter();
  const v = setting.value;
  const [enabled, setEnabled] = useState(v.enabled);
  const [provider, setProvider] = useState<EmailProvider>(v.provider);
  const [busy, setBusy] = useState(false);
  const p = PROVIDERS[provider];
  const hint = (k: keyof EmailSettings) => (setting.sources[k] && setting.sources[k] !== "default" ? FROM[setting.sources[k]!] : null);

  async function save(form: FormData) {
    const next = {
      enabled,
      provider,
      from: String(form.get("from") ?? "").trim(),
      replyTo: String(form.get("replyTo") ?? "").trim() || null,
    };
    // Only what changed becomes the organization's own.
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(next).filter(([k, x]) => x !== v[k as keyof EmailSettings]));
    const key = String(form.get("apiKey") ?? "").trim();
    if (key) patch.apiKey = key;
    if (!Object.keys(patch).length) return toast("Nothing changed");
    setBusy(true);
    const saved = await send("PATCH", "/api/v1/settings/email?context=organization", patch);
    setBusy(false);
    if (!saved) return;
    toast.success(saved.value.enabled ? "Email is on" : "Saved; email is off");
    router.refresh();
  }

  async function test(form: FormData) {
    const r = await send("POST", "/api/v1/email/test", { to: String(form.get("to") ?? "").trim() || undefined });
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
            void save(new FormData(e.currentTarget));
          }}
        >
          <div className="flex items-center gap-2">
            <Switch id={`${id}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor={`${id}-enabled`} className="font-normal">
              Send email from {me.workspace.organization.name}
            </Label>
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
                  <a href={p.site} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {p.site.replace("https://", "")}
                  </a>{" "}
                  and verify the domain you send from.
                </>
              ) : (
                "Messages are printed to the server's log instead of sent: for trying it out."
              )}
            </Hint>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input id={`${id}-from`} name="from" defaultValue={v.from} placeholder={`${me.workspace.organization.name} <assets@example.com>`} maxLength={320} />
            <Hint text={hint("from")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-replyTo`}>Reply to</Label>
            <Input id={`${id}-replyTo`} name="replyTo" type="email" defaultValue={v.replyTo ?? ""} placeholder="Optional" maxLength={320} />
            <Hint text={hint("replyTo")} />
          </div>
          {p.needsKey && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-apiKey`}>API key</Label>
              <Input
                id={`${id}-apiKey`}
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={setting.secrets.apiKey ? "Saved. Leave blank to keep it" : "Paste it here"}
                maxLength={500}
              />
              <Hint text={hint("apiKey")}>Kept encrypted, and never shown again.</Hint>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Save
            </Button>
            {setting.own && (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  if (await send("DELETE", "/api/v1/settings/email?context=organization")) {
                    toast.success("Back to the server's settings");
                    router.refresh();
                  }
                }}
              >
                Use the server&apos;s settings
              </Button>
            )}
          </div>
        </form>
      </Group>

      <Group title="Send a test" description="Through the settings above, as they are saved.">
        <form
          className="flex max-w-lg gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void test(new FormData(e.currentTarget));
          }}
        >
          <Input name="to" type="email" placeholder={me.user?.email ?? "you@example.com"} aria-label="Send the test to" required={!me.user} />
          <Button type="submit" variant="outline" disabled={!v.enabled}>
            <IconSend /> Send
          </Button>
        </form>
      </Group>
    </div>
  );
}

function Hint({ text, children }: { text: string | null; children?: React.ReactNode }) {
  if (!text && !children) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {children}
      {text && children && " "}
      {text && <span className="italic">Now {text}.</span>}
    </p>
  );
}
