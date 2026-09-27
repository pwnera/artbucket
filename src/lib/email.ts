import { z } from "zod";

/**
 * Sending email through a third party, over its HTTP API: no SMTP client, no
 * SDK. A provider is a name, whether it needs an API key, and one function
 * from a message to a request. Adding one is adding an entry here.
 *
 * Relative imports only: `pnpm test` runs this under plain Node.
 */

export type Message = { to: string; subject: string; text: string; html: string };

export const EMAIL_PROVIDERS = ["resend", "postmark", "sendgrid", "console"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

/** How email goes out. Off until someone turns it on, here or with EMAIL_* in the environment. */
export const EmailSettings = z.object({
  enabled: z.boolean(),
  provider: z.enum(EMAIL_PROVIDERS),
  /** `Artbucket <hello@example.com>` or a bare address, on a domain the provider has verified. */
  from: z.string().trim().max(320),
  replyTo: z.email().max(320).nullable(),
  /** Secret: encrypted at rest, never sent back. */
  apiKey: z.string().trim().max(500).nullable(),
});
export type EmailSettings = z.infer<typeof EmailSettings>;

/** "Name <a@b.c>" to its parts; a bare address has no name. */
export function parseAddress(from: string) {
  const m = from.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, "") || null, email: m[2] } : { name: null, email: from.trim() };
}

/** A request, so it can be tested without sending anything. */
export type Outgoing = { url: string; headers: Record<string, string>; body: unknown } | { log: string };

type Provider = { label: string; site: string; needsKey: boolean; request: (c: EmailSettings, m: Message) => Outgoing };

const json = { "Content-Type": "application/json", Accept: "application/json" };

export const PROVIDERS: Record<EmailProvider, Provider> = {
  resend: {
    label: "Resend",
    site: "https://resend.com",
    needsKey: true,
    request: (c, m) => ({
      url: "https://api.resend.com/emails",
      headers: { ...json, Authorization: `Bearer ${c.apiKey}` },
      body: { from: c.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(c.replyTo && { reply_to: c.replyTo }) },
    }),
  },
  postmark: {
    label: "Postmark",
    site: "https://postmarkapp.com",
    needsKey: true,
    request: (c, m) => ({
      url: "https://api.postmarkapp.com/email",
      headers: { ...json, "X-Postmark-Server-Token": c.apiKey ?? "" },
      body: { From: c.from, To: m.to, Subject: m.subject, HtmlBody: m.html, TextBody: m.text, MessageStream: "outbound", ...(c.replyTo && { ReplyTo: c.replyTo }) },
    }),
  },
  sendgrid: {
    label: "SendGrid",
    site: "https://sendgrid.com",
    needsKey: true,
    request: (c, m) => {
      const from = parseAddress(c.from);
      return {
        url: "https://api.sendgrid.com/v3/mail/send",
        headers: { ...json, Authorization: `Bearer ${c.apiKey}` },
        body: {
          personalizations: [{ to: [{ email: m.to }] }],
          from: { email: from.email, ...(from.name && { name: from.name }) },
          ...(c.replyTo && { reply_to: { email: c.replyTo } }),
          subject: m.subject,
          content: [
            { type: "text/plain", value: m.text },
            { type: "text/html", value: m.html },
          ],
        },
      };
    },
  },
  /** Prints the message to the server's log: for trying it out, not for people. */
  console: {
    label: "Server log",
    site: "",
    needsKey: false,
    request: (c, m) => ({ log: `email to ${m.to} from ${c.from}: ${m.subject}\n${m.text}` }),
  },
};

/** Why these settings can't send, or null when they can. */
export function unusable(c: EmailSettings): string | null {
  if (!c.enabled) return "Email is off";
  if (!parseAddress(c.from).email.includes("@")) return "Set a from address";
  if (PROVIDERS[c.provider].needsKey && !c.apiKey) return `${PROVIDERS[c.provider].label} needs an API key`;
  return null;
}

/** Send one message; throws with the provider's own words when it refuses. */
export async function deliver(c: EmailSettings, m: Message, fetcher: typeof fetch = fetch) {
  const no = unusable(c);
  if (no) throw new Error(no);
  const out = PROVIDERS[c.provider].request(c, m);
  if ("log" in out) return void console.info(out.log);
  const res = await fetcher(out.url, { method: "POST", headers: out.headers, body: JSON.stringify(out.body), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${PROVIDERS[c.provider].label} refused it (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** One plain layout for every message: a sentence or two, and a button. */
export function layout({ to, subject, lines, action }: { to: string; subject: string; lines: string[]; action?: { label: string; url: string } }): Message {
  const text = [...lines, ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:32px">
${lines.map((l) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escape(l)}</p>`).join("\n")}
${action ? `<p style="margin:24px 0 0"><a href="${escape(action.url)}" style="display:inline-block;background:#34a853;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escape(action.label)}</a></p>` : ""}
</div></body></html>`;
  return { to, subject, text, html };
}
