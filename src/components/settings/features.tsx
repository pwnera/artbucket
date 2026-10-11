"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { FeatureManage } from "@/components/settings/feature-manage";
import { IconChartBar, IconCompass, IconLink, IconRobot, IconSparkles, IconToggleLeft, IconWorld, type Icon } from "@/components/icons";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { send } from "@/lib/send";
import { ago, exact } from "@/lib/time";

/** A feature as GET /api/v1/features describes it (lib/core/features.ts). */
export type FeatureItem = {
  id: string;
  name: string;
  description: string;
  off: string | null;
  icon: string | null;
  builtin: boolean;
  levels: ("organization" | "project")[];
  default: "on" | "off";
  available: boolean;
  manage: string | null;
  rule: "on" | "off" | "projects";
  projects: { on: number; total: number } | null;
  on: boolean | null;
  from: "organization" | "project" | "default" | "plan" | null;
  editable: boolean;
  set: { by: string; at: string } | null;
};

/** What switching would do (GET /api/v1/features/{id}/impact): asked before, when it reaches outside the admin's view. */
type Impact = { changes: number; confirm: boolean; title: string; says: string[]; action: string };

/** The icons a feature may name (FEATURES_FILE's `icon`); a switch for any other. */
const ICONS: Record<string, Icon> = { robot: IconRobot, link: IconLink, sparkles: IconSparkles, world: IconWorld, hub: IconCompass, chart: IconChartBar };

const When = ({ set }: { set: FeatureItem["set"] }) =>
  set && (
    <>
      {" "}
      by {set.by}, <time title={exact(set.at)}>{ago(set.at)}</time>
    </>
  );

/**
 * Settings, Features: what the organization's projects use (lib/features.ts).
 * At the organization each is on or off everywhere, or left to each project;
 * in a project, its own switch where the organization lets it decide.
 */
export function FeaturesPanel({ features, context, upgrade }: { features: FeatureItem[]; context: "organization" | "project"; upgrade: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ f: FeatureItem; state: FeatureItem["rule"]; impact: Impact } | null>(null);
  // The feature whose own view (Manage) is open.
  const [managing, setManaging] = useState<FeatureItem | null>(null);

  /** Weigh it first: what reaches outside (keys, links, portals, listings), or overrides projects, is asked about. */
  async function change(f: FeatureItem, state: FeatureItem["rule"]) {
    setBusy(f.id);
    const impact = (await send("GET", `/api/v1/features/${f.id}/impact?context=${context}&state=${state}`)) as Impact | null;
    if (impact?.confirm) {
      setBusy(null);
      return setAsking({ f, state, impact });
    }
    if (impact) await apply(f, state);
    setBusy(null);
  }

  async function apply(f: FeatureItem, state: FeatureItem["rule"]) {
    const done = await send("PUT", `/api/v1/features/${f.id}?context=${context}`, { state });
    if (!done) return null;
    toast.success(
      state === "projects"
        ? `Each project decides about ${f.name} now`
        : `${f.name} ${state === "on" ? "on" : "off"}${context === "organization" && f.levels.includes("project") ? " for every project" : ""}`,
    );
    router.refresh();
    return done;
  }

  return (
    <>
      <Confirm
        open={!!asking}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking?.impact.title}
        says={
          asking && (
            <span className="grid gap-2">
              {asking.impact.says.map((s) => (
                <span key={s} className="block">
                  {s}
                </span>
              ))}
            </span>
          )
        }
        action={asking?.impact.action}
        destructive={asking?.state === "off"}
        run={() => asking && apply(asking.f, asking.state)}
      />
      {managing?.manage && (
        <FeatureManage name={managing.name} url={managing.manage} open onOpenChange={(o) => !o && setManaging(null)} />
      )}
    <ul className="divide-y rounded-lg border">
      {features.map((f) => {
        const I = (f.icon && ICONS[f.icon]) || IconToggleLeft;
        return (
          <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4 sm:flex-nowrap sm:p-5">
            <I className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="font-display flex items-center gap-1.5 text-sm font-semibold">
                {f.name}
                {f.off && <InfoTip>Off: {f.off}</InfoTip>}
              </h2>
              <p className="text-muted-foreground text-sm text-pretty">{f.description}</p>
              <p className="text-muted-foreground text-xs">
                <Status f={f} context={context} />
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:pl-9">
              {!f.available ? (
                upgrade ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={upgrade}>See plans</a>
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-xs">Not on this organization&apos;s plan</span>
                )
              ) : context === "organization" ? (
                f.editable && (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={f.rule}
                    disabled={busy === f.id}
                    onValueChange={(v) => v && v !== f.rule && change(f, v as FeatureItem["rule"])}
                    aria-label={`${f.name} for the organization`}
                  >
                    <ToggleGroupItem value="on" className="px-3">
                      On
                    </ToggleGroupItem>
                    {f.levels.includes("project") && (
                      <ToggleGroupItem value="projects" className="px-3">
                        Each project
                      </ToggleGroupItem>
                    )}
                    <ToggleGroupItem value="off" className="px-3">
                      Off
                    </ToggleGroupItem>
                  </ToggleGroup>
                )
              ) : (
                <>
                  {f.manage && f.on && (
                    <Button size="sm" variant="ghost" onClick={() => setManaging(f)}>
                      Manage
                    </Button>
                  )}
                  <Switch
                    checked={!!f.on}
                    disabled={!f.editable || busy === f.id}
                    onCheckedChange={(on) => change(f, on ? "on" : "off")}
                    aria-label={f.name}
                  />
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

function Status({ f, context }: { f: FeatureItem; context: "organization" | "project" }) {
  // Off for want of a plan: its switches are kept, and it comes back as it was with one.
  if (!f.available) return <>Off: not part of this organization&apos;s plan</>;
  if (context === "organization") {
    if (f.rule === "projects") {
      const p = f.projects!;
      return (
        <>
          Each project decides: on in {p.on} of {p.total} {p.total === 1 ? "project" : "projects"}
        </>
      );
    }
    const everywhere = f.levels.includes("project") ? " for every project" : "";
    return (
      <>
        {f.rule === "on" ? "On" : "Off"}
        {everywhere}
        <When set={f.set} />
      </>
    );
  }
  if (f.from === "organization") {
    return (
      <>
        Turned {f.on ? "on" : "off"} for the whole organization
        <When set={f.set} />
      </>
    );
  }
  if (f.from === "project") {
    return (
      <>
        Turned {f.on ? "on" : "off"} here
        <When set={f.set} />
      </>
    );
  }
  return <>{f.on ? "On" : "Off"} unless someone turns it {f.on ? "off" : "on"}</>;
}
