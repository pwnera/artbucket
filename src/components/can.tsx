"use client";

import { createContext, useContext } from "react";
import type { Me } from "@/components/account";
import { can, type Action, type Target } from "@/lib/permissions";

/**
 * What the person looking may do, for every control in the app. The
 * (app) layout provides it from /api/v1/me; controls ask by the action names
 * the API checks (lib/permissions.ts), so a button shows exactly when its
 * request would be allowed. A control for something new asks for its action;
 * nothing here changes.
 */

const Who = createContext<Me | null>(null);

export function AccessProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <Who.Provider value={me}>{children}</Who.Provider>;
}

/** `const can = useCan(); can("asset.edit", asset)`. Outside the provider nothing is allowed. */
export function useCan() {
  const who = useContext(Who);
  return (action: Action, target?: Target | null) => !!who && can(who, action, target);
}

/** Its children when the person may do `do` (to `on`), else `otherwise`. */
export function Can({
  do: action,
  on,
  otherwise = null,
  children,
}: {
  do: Action;
  on?: Target | null;
  otherwise?: React.ReactNode;
  children: React.ReactNode;
}) {
  return useCan()(action, on) ? children : otherwise;
}

/**
 * A form part the person may only read unless they may do `do`: its controls
 * are disabled (a native fieldset), so what they can't change looks it.
 * `when` false disables it too (a setting that waits on another); `why` says
 * why above it while it is disabled, so a greyed form isn't a riddle.
 */
export function Writable({
  do: action,
  on,
  when = true,
  why,
  children,
}: {
  do: Action;
  on?: Target | null;
  when?: boolean;
  why?: string;
  children: React.ReactNode;
}) {
  const disabled = !useCan()(action, on) || !when;
  return (
    <>
      {disabled && why && <p className="text-muted-foreground text-sm">{why}</p>}
      <fieldset disabled={disabled} className="contents">
        {children}
      </fieldset>
    </>
  );
}

/** Who is looking, for what a control says rather than whether it shows: their name, whether email is on. */
export const useMe = () => useContext(Who);
