"use client";

import { IconSparkles } from "@/components/icons";
import { useMe } from "@/components/can";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/**
 * A page whose feature the organization's plan doesn't have (lib/limits.ts):
 * what it is, and the way to a plan for its admins (me.upgrade, else
 * me.billing); everyone else is told who can.
 */
export function PlanGate({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  const me = useMe();
  const to = me?.upgrade ?? me?.billing ?? null;
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          {description} {to ? "It comes with a paid plan." : "It comes with a paid plan: an admin of the organization can take one."}
        </EmptyDescription>
      </EmptyHeader>
      {to && (
        <EmptyContent>
          <Button asChild>
            <a href={to}>
              <IconSparkles aria-hidden /> Upgrade
            </a>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
