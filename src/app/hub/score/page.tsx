import type { Metadata } from "next";
import { headers } from "next/headers";
import { IconCircleCheckFilled, IconCircleDashed, IconRobot } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { scoreDomain } from "@/lib/core/agent-score";
import { AssetError } from "@/lib/core/errors";
import { hubBase } from "@/lib/core/hub";
import { env } from "@/lib/env";
import Form from "next/form";
import { SubmitButton } from "@/components/submit-button";
import { WhilePending } from "@/components/hub-client";
import { Button } from "@/components/ui/button";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const asked = !!(await searchParams).domain;
  return {
    title: { absolute: "Brand Agent Score: what agents find of your brand" },
    description: "Enter a domain: see what an AI agent can find of the brand there, llms.txt, rules, logo, tokens and MCP, scored out of 100, and what raises it.",
    // The form is for anyone to find; a report is one domain's, for whoever asked.
    ...(asked && { robots: { index: false, follow: true } }),
  };
}

/**
 * The public Brand Agent Score (lib/core/agent-score.ts): a domain in, the
 * report out, with what raises it and a way onto BrandHub. A plain GET form,
 * so a report has an address to share.
 */
export default async function ScorePage({ searchParams }: Props) {
  const raw = (await searchParams).domain;
  const domain = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 300) ?? "";
  const [base, h] = await Promise.all([hubBase(), headers()]);
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  let report = null;
  let error: string | null = null;
  if (domain) {
    try {
      report = await scoreDomain(domain, ip);
    } catch (err) {
      if (!(err instanceof AssetError)) throw err;
      error = err.message;
    }
  }
  const raises = report?.checks.filter((c) => !c.done).sort((a, b) => b.points - a.points) ?? [];

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-4 py-12 md:py-16">
      <header className="grid gap-4">
        <p className="text-primary-ink flex items-center gap-2 text-xs font-semibold tracking-[.14em] uppercase">
          <IconRobot aria-hidden className="size-4" /> Brand Agent Score
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance">What does an agent find of your brand?</h1>
        <p className="text-muted-foreground text-lg text-pretty">
          Enter a domain. We look where an AI agent looks: an llms.txt, the brand&apos;s rules as data, its logo, design tokens, an MCP server, and a verified BrandHub listing.
        </p>
        <Form action={`${base}/score`} className="grid gap-3">
          <div className="flex gap-2">
            <Input name="domain" defaultValue={domain} placeholder="example.com" aria-label="Domain" className="h-11 text-base" autoCapitalize="none" spellCheck={false} inputMode="url" />
            <SubmitButton className="h-11">Check</SubmitButton>
          </div>
          <WhilePending className="justify-center">Looking where an agent looks: llms.txt, rules, logo, tokens, MCP. A few seconds.</WhilePending>
        </Form>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </header>

      {report && (
        <section aria-labelledby="report" className="bg-card grid gap-5 rounded-xl border p-5 md:p-6">
          <div className="grid gap-2">
            <h2 id="report" className="text-muted-foreground text-sm">
              {report.domain}
            </h2>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-5xl font-semibold tabular-nums">{report.score}</span>
              <span className="text-muted-foreground">/ 100</span>
            </div>
            <Progress value={report.score} className="h-2" aria-label="Brand Agent Score" />
          </div>
          <ul className="grid gap-3">
            {[...report.checks.filter((c) => c.done), ...raises].map((c) => (
              <li key={c.id} className="flex items-start gap-3 text-sm">
                {c.done ? (
                  <IconCircleCheckFilled aria-label="Found" className="text-success mt-0.5 size-4 shrink-0" />
                ) : (
                  <IconCircleDashed aria-label="Missing" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                )}
                <span className="grid gap-0.5">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-muted-foreground break-words">{c.detail}</span>
                </span>
                {!c.done && <span className="text-success ms-auto shrink-0 text-xs font-medium tabular-nums">+{c.points}</span>}
              </li>
            ))}
          </ul>
          <div className="bg-muted/50 grid gap-3 rounded-lg p-4">
            {report.listing ? (
              <p className="text-sm">
                {report.listing.name} is on BrandHub, verified for {report.domain}:{" "}
                <a href={report.listing.url} className="text-primary-ink underline underline-offset-2">
                  {report.listing.url.replace(/^https?:\/\//, "")}
                </a>
                .
              </p>
            ) : (
              <>
                <p className="text-sm">
                  List the brand on BrandHub: its rules, logos, type and tokens as data, an llms.txt any agent reads, and a verified badge once you prove {report.domain}. Free.
                </p>
                <Button asChild className="justify-self-start">
                  <a href={`${env.APP_URL}/brands`}>List your brand on BrandHub</a>
                </Button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
