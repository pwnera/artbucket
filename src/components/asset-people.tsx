"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconX } from "@/components/icons";
import { Initials } from "@/components/activity";
import { useCan, useMe } from "@/components/can";
import { type Collection } from "@/components/collections";
import { Combobox } from "@/components/combobox";
import { IconButton } from "@/components/icon-button";
import type { Members } from "@/components/settings/access";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { roleName, ROLES, type Scope } from "@/lib/scopes";
import { send } from "@/lib/send";
import { RetryLine } from "@/components/retry-line";
import { undoable } from "@/lib/undo";

/** Admin over one asset is admin over nothing else: people get up to editor here. */
const PICK = ROLES.filter((r) => r.scope !== "admin");

/**
 * Who sees a private asset: people added to it, people added to one of its
 * collections, and the project's admins. A project admin adds and
 * removes people here; everyone else is told who can.
 */
export function AssetPeople({ asset, collections }: { asset: { id: string; collections: string[] }; collections: Collection[] }) {
  const can = useCan();
  const me = useMe();
  const manage = can("member.manage");
  const [members, setMembers] = useState<Members["data"] | null>(null);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const load = () =>
    fetch("/api/v1/members?in=project")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: Members) => setMembers(b.data))
      .catch(() => setFailed(true));
  useEffect(() => {
    if (manage) void load();
  }, [manage, asset.id]);

  if (!manage) return <p className="text-muted-foreground py-1 text-xs">A project admin can add people to it.</p>;
  if (!members) return failed ? <RetryLine what="who sees it" retry={() => (setFailed(false), void load())} /> : <Skeleton className="h-9" />;

  const nameOf = (cid: string) => collections.find((c) => c.id === cid)?.name ?? "a collection";
  const added = members.flatMap((m) => m.grants.filter((g) => g.resource === "asset" && g.resourceId === asset.id).map((g) => ({ m, g })));
  const via = members.flatMap((m) =>
    m.grants.filter((g) => g.resource === "collection" && asset.collections.includes(g.resourceId)).map((g) => ({ m, g })),
  );
  const admins = members.filter((m) =>
    m.grants.some((g) => g.scope === "admin" && (g.resource === "organization" || (g.resource === "project" && g.resourceId === me?.project.id))),
  );
  const listed = new Set([...added, ...via].map((r) => r.m.id).concat(admins.map((m) => m.id)));
  const options = members.filter((m) => !listed.has(m.id)).map((m) => ({ value: m.id, label: m.name || m.email, hint: m.email }));

  const grant = async (user: string, scope: Scope) => {
    if (await send("POST", "/api/v1/grants", { user, resource: "asset", resourceId: asset.id, scope })) await load();
  };
  const remove = async ({ m, g }: (typeof added)[number]) => {
    setRemoving(g.id);
    const done = await send("DELETE", `/api/v1/grants/${g.id}`);
    setRemoving(null);
    if (!done) return;
    await load();
    undoable(`Removed ${m.name || m.email} from this asset`, {
      undo: async () => {
        if (!(await send("POST", "/api/v1/grants", { user: m.id, resource: "asset", resourceId: asset.id, scope: g.scope }))) return false;
        await load();
      },
    });
  };

  return (
    <div className="grid gap-1.5 py-1">
      <ul className="grid gap-1">
        {added.map(({ m, g }) => (
          <li key={g.id} className="flex items-center gap-2 text-sm">
            <Initials name={m.name || m.email} />
            <span className="min-w-0 flex-1 truncate" title={m.email}>
              {m.name || m.email}
            </span>
            <Select value={g.scope} onValueChange={(v) => void grant(m.id, v as Scope)}>
              <SelectTrigger size="sm" className="h-7 w-28" aria-label={`${m.name || m.email}'s role on this asset`}>
                <SelectValue>{roleName(g.scope)}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {PICK.map((r) => (
                  <SelectItem key={r.scope} value={r.scope}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <IconButton label={`Remove ${m.name || m.email}`} variant="ghost" size="icon" className="size-7" pending={removing === g.id} onClick={() => void remove({ m, g })}>
              <IconX />
            </IconButton>
          </li>
        ))}
        {via.map(({ m, g }) => (
          <li key={g.id} className="flex items-center gap-2 text-sm">
            <Initials name={m.name || m.email} />
            <span className="min-w-0 flex-1 truncate" title={m.email}>
              {m.name || m.email}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {roleName(g.scope)} via {nameOf(g.resourceId)}
            </span>
          </li>
        ))}
      </ul>
      {options.length > 0 ? (
        <Combobox options={options} value="" onChange={(v) => v && void grant(v, "read")} placeholder="Add a person" />
      ) : (
        <p className="text-muted-foreground text-xs">
          Everyone in the project is here already.{" "}
          <Link href="/team?invite" className="text-foreground underline underline-offset-2">
            Invite someone
          </Link>{" "}
          to add them.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {admins.length ? `Admins see it too: ${admins.map((m) => m.name || m.email).join(", ")}.` : "Admins see it too."}
      </p>
    </div>
  );
}
