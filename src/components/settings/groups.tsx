"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash, IconUsersGroup, IconX } from "@tabler/icons-react";
import { IconButton } from "@/components/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleName, ROLES, type Scope } from "@/lib/scopes";
import { send } from "@/lib/send";

/**
 * The organization's groups (GET /api/v1/groups): who is in each, and the
 * roles the group holds, which each member has. Made by its admins, of its
 * own people only.
 */

type Person = { id: string; name: string; email: string };
type GroupGrant = { id: string; resource: string; resourceId: string; label: string | null; scope: Scope };
export type GroupRow = { id: string; name: string; members: Person[]; grants: GroupGrant[] };
type Place = { resource: "organization" | "project"; resourceId: string; label: string };

export function GroupsPanel({ groups, people, places }: { groups: GroupRow[]; people: Person[]; places: Place[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const done = (r: unknown) => r && router.refresh();
  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await send("POST", "/api/v1/groups", { name })) {
            setName("");
            router.refresh();
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand team" aria-label="New group's name" className="max-w-xs" />
        <Button type="submit" variant="outline">
          <IconPlus /> New group
        </Button>
      </form>
      {!groups.length && <p className="text-muted-foreground text-sm">No groups yet. Give a group a role once, and everyone in it has it.</p>}
      <ul className="space-y-4">
        {groups.map((g) => (
          <GroupCard key={g.id} g={g} people={people} places={places} done={done} />
        ))}
      </ul>
    </div>
  );
}

function GroupCard({ g, people, places, done }: { g: GroupRow; people: Person[]; places: Place[]; done: (r: unknown) => void }) {
  const [where, setWhere] = useState(places[0] ? `${places[0].resource}:${places[0].resourceId}` : "");
  const [scope, setScope] = useState<Scope>("read");
  const outside = people.filter((p) => !g.members.some((m) => m.id === p.id));
  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <IconUsersGroup aria-hidden className="text-muted-foreground size-4" />
        <h3 className="font-medium">{g.name}</h3>
        <span className="text-muted-foreground text-sm tabular-nums">{g.members.length}</span>
        <IconButton
          variant="ghost"
          size="icon-sm"
          label={`Delete ${g.name}`}
          className="text-muted-foreground hover:text-destructive ms-auto"
          onClick={async () => done(await send("DELETE", `/api/v1/groups/${g.id}`))}
        >
          <IconTrash />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {g.members.map((m) => (
          <Badge key={m.id} variant="secondary" className="gap-1 pe-1">
            {m.name || m.email}
            <button
              type="button"
              aria-label={`Take ${m.name || m.email} out of ${g.name}`}
              onClick={async () => done(await send("POST", `/api/v1/groups/${g.id}/members`, { remove: [m.id] }))}
            >
              <IconX className="size-3" />
            </button>
          </Badge>
        ))}
        {outside.length > 0 && (
          <Select value="" onValueChange={async (id) => done(await send("POST", `/api/v1/groups/${g.id}/members`, { add: [id] }))}>
            <SelectTrigger size="sm" className="h-7 w-40" aria-label={`Add someone to ${g.name}`}>
              <SelectValue placeholder="Add someone" />
            </SelectTrigger>
            <SelectContent>
              {outside.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-1.5 text-sm">
        {g.grants.map((x) => (
          <div key={x.id} className="flex items-center gap-2">
            <Badge variant="outline">{roleName(x.scope)}</Badge>
            <span className="text-muted-foreground">on {x.label ?? x.resource}</span>
            <IconButton
              variant="ghost"
              size="icon-xs"
              label={`Take ${g.name}'s access to ${x.label}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={async () => done(await send("DELETE", `/api/v1/grants/${x.id}`))}
            >
              <IconX />
            </IconButton>
          </div>
        ))}
        {places.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger size="sm" className="h-7 w-32" aria-label="Role">
                <SelectValue>{roleName(scope)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.scope} value={r.scope}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">on</span>
            <Select value={where} onValueChange={setWhere}>
              <SelectTrigger size="sm" className="h-7 w-48" aria-label="On">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {places.map((p) => (
                  <SelectItem key={p.resourceId} value={`${p.resource}:${p.resourceId}`}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="xs"
              variant="outline"
              onClick={async () => {
                const [resource, resourceId] = where.split(":");
                done(await send("POST", "/api/v1/grants", { group: g.id, resource, resourceId, scope }));
              }}
            >
              Give access
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
