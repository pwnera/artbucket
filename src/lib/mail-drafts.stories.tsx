import preview from "#.storybook/preview";
import { NOW } from "#.storybook/fixtures/library";
import { expect, waitFor } from "storybook/test";
import { useBrand } from "@/components/brand";
import { render, type Draft } from "@/lib/branding";
import { digestEmail, staleVersionEmail } from "@/lib/mail-drafts";

/** An email as it arrives: who it is to, its subject, then the message as render() draws it for mail clients. */
function Email({ draft, from }: { draft: Draft; from: string }) {
  const { accent } = useBrand();
  const m = render(draft, { name: from, accent, emailFooter: null, logo: null });
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-lg border">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b px-4 py-3 text-sm">
        <dt className="text-muted-foreground">To</dt>
        <dd>{m.to}</dd>
        <dt className="text-muted-foreground">Subject</dt>
        <dd className="font-medium">{m.subject}</dd>
      </dl>
      <iframe
        title={m.subject}
        srcDoc={m.html}
        className="block h-96 w-full"
        onLoad={(e) => (e.currentTarget.style.height = `${e.currentTarget.contentDocument!.documentElement.scrollHeight}px`)}
      />
    </div>
  );
}

const meta = preview.meta({
  title: "App/Emails",
  component: Email,
  args: { from: "Acme" },
  parameters: { layout: "padded" },
});

const inside = async (canvas: { getByTitle: (t: string) => HTMLElement }, subject: string, text: RegExp) => {
  const frame = canvas.getByTitle(subject) as HTMLIFrameElement;
  await waitFor(() => expect(frame.contentDocument?.body.textContent).toMatch(text));
};

/** Fixes' Notify (lib/core/insights.ts notifyStale): a place still loading a replaced version, and the link to use instead. */
export const Notify = meta.story({
  args: {
    draft: staleVersionEmail("webmaster@acme.test", {
      by: "Dana Reyes",
      organization: "Acme Inc",
      place: "www.acme.test",
      agent: false,
      assets: [{ title: "acme-logo.svg", version: 1, current: { title: "acme-logo.svg", version: 2, url: "https://assets.acme.test/c/ast_logo/acme-logo.svg" } }],
    }),
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(args.draft.subject)).toBeInTheDocument();
    await inside(canvas, args.draft.subject, /still loads a version replaced since/);
  },
});

/** The Monday digest (lib/core/digest.ts): the week before, a line or two per section that has something. */
export const Digest = meta.story({
  args: {
    draft: digestEmail("dana@acme.test", {
      project: "Acme",
      url: "https://assets.acme.test",
      projectId: "prj_acme",
      start: new Date(NOW - 10 * 86_400_000),
      unsubscribe: "https://assets.acme.test/unsubscribe",
      digest: {
        releases: [{ brand: "Acme", slug: "acme", version: 12, note: "a warmer accent" }],
        added: ["autumn-campaign-hero.jpg", "autumn-lookbook-01.jpg", "autumn-lookbook-02.jpg", "brand-reel-cutdown.mp4", "team-offsite-2026.jpg", "acme-icon.svg"],
        replaced: ["acme-logo.svg"],
        expiring: [
          { id: "ast_hero", title: "hero-spring.jpg", expires: "2026-10-17", replacement: null },
          { id: "ast_team", title: "team-offsite-2024.jpg", expires: "2026-10-24", replacement: "team-offsite-2026.jpg" },
        ],
        expiringTotal: 2,
        gaps: ["winter campaign", "team photo"],
        review: 1,
      },
    }),
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(args.draft.subject)).toBeInTheDocument();
    await inside(canvas, args.draft.subject, /found nothing/);
  },
});
