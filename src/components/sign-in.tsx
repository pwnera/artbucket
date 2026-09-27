"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { IconBuilding, IconKey, IconLogout, IconMailOpened } from "@tabler/icons-react";
import { MakeDialog, pickWorkspace, signOut, useGo, type Me } from "@/components/account";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Signing in and up, against better-auth at /api/auth: who someone is. What
 * they may do is /api/v1's business, and every page asks it.
 */

async function authPost(path: string, body: unknown): Promise<{ ok: true; data: { url?: string } } | { ok: false; message: string }> {
  const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data: json } : { ok: false, message: json.message ?? "That didn't work" };
}

/** A centered card with the mark, for pages outside the app. */
export function Card({ title, lead, children }: { title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <div className="bg-background w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="space-y-3">
          <Logo />
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {lead && <div className="text-muted-foreground text-sm text-pretty">{lead}</div>}
        </div>
        {children}
      </div>
    </main>
  );
}

/**
 * Email and password, one way or the other, and single sign-on when there
 * is some. `then` runs once signed in; by default, home.
 */
export function AuthForm({
  mode: initial,
  signUp,
  oidc,
  email: fixed,
  callbackURL = "/",
  beforeSubmit,
  then,
  forgot = false,
}: {
  mode: "in" | "up";
  /** Whether signing up is on offer at all. */
  signUp: boolean;
  oidc: { name: string } | null;
  /** From an invitation: filled in. */
  email?: string;
  callbackURL?: string;
  /** Runs before either form or SSO goes: an invitation leaves its cookie. */
  beforeSubmit?: () => void;
  then?: () => void;
  /** Offer "Forgot your password?": some email can go out. */
  forgot?: boolean;
}) {
  const id = useId();
  const go = useGo();
  const [mode, setMode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError(null);
    beforeSubmit?.();
    const r =
      mode === "in"
        ? await authPost("sign-in/email", { email, password })
        : await authPost("sign-up/email", { name: String(form.get("name") ?? "").trim() || email.split("@")[0], email, password });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (then) then();
    else go(callbackURL);
  }

  async function sso() {
    beforeSubmit?.();
    const r = await authPost("sign-in/social", { provider: "oidc", callbackURL });
    if (r.ok && r.data.url) window.location.assign(r.data.url);
    else setError(r.ok ? "Single sign-on is not answering" : r.message);
  }

  return (
    <div className="space-y-4">
      {oidc && (
        <>
          <Button type="button" variant="outline" className="w-full" onClick={sso}>
            <IconKey /> Sign in with {oidc.name}
          </Button>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" /> or with a password <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        {mode === "up" && (
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} name="name" autoComplete="name" required maxLength={120} autoFocus />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor={`${id}-email`}>Email</Label>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={fixed}
            autoFocus={mode === "in" && !fixed}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-password`}>Password</Label>
          <Input
            id={`${id}-password`}
            name="password"
            type="password"
            required
            minLength={mode === "up" ? 10 : undefined}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            autoFocus={mode === "in" && !!fixed}
          />
          {mode === "up" && <p className="text-muted-foreground text-xs">At least 10 characters.</p>}
          {mode === "in" && forgot && (
            <Link href="/forgot-password" className="text-muted-foreground w-fit text-xs underline underline-offset-2">
              Forgot your password?
            </Link>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {mode === "in" ? "Sign in" : "Make my account"}
        </Button>
      </form>
      {signUp && (
        <p className="text-muted-foreground text-center text-sm">
          {mode === "in" ? "New here? " : "Have an account? "}
          <button type="button" className="text-foreground underline underline-offset-2" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Make an account" : "Sign in"}
          </button>
        </p>
      )}
    </div>
  );
}

/** /login */
export function SignInPage({ auth, next }: { auth: Me["auth"]; next?: string }) {
  const first = auth.signUp;
  return (
    <Card
      title={first ? "Make the first account" : "Sign in to Artbucket"}
      lead={
        first
          ? "Welcome to Artbucket. Nothing works until this server has an account: the first one is the admin of everything, and from then on only people signed in, and API keys, get in."
          : "Accounts are by invitation: ask an admin for a link if you don't have one."
      }
    >
      {/* First run: making the account is all there is; nobody has one to sign in with. */}
      <AuthForm mode={first ? "up" : "in"} signUp={false} oidc={auth.oidc} callbackURL={next || "/"} forgot={auth.passwordReset} />
    </Card>
  );
}

/** /welcome: signed in, with nowhere to be yet. */
export function Welcome({ me }: { me: Me }) {
  const go = useGo();
  const [making, setMaking] = useState(false);
  return (
    <Card
      title={`Welcome, ${me.user?.name || me.user?.email}`}
      lead="You're signed in, but nobody has given you access to a workspace yet. Ask an admin for an invitation, or start an organization of your own."
    >
      <div className="grid gap-2">
        <Button onClick={() => setMaking(true)}>
          <IconBuilding /> Make an organization
        </Button>
        <Button variant="ghost" onClick={() => signOut(go)}>
          <IconLogout /> Sign out
        </Button>
      </div>
      {making && <MakeDialog kind="organization" onClose={() => setMaking(false)} />}
    </Card>
  );
}

export type InvitationInfo = {
  email: string;
  organization: string;
  resource: "organization" | "workspace" | "collection" | "asset";
  label: string | null;
  scope: string;
  invitedBy: string;
  expiresAt: string;
  signUp: boolean;
};

const SCOPE_WORDS: Record<string, string> = {
  read: "look around",
  propose: "suggest additions",
  write: "edit",
  admin: "manage everything",
};

/** /invite/{token}: what it offers, then sign up, sign in, or just accept. */
export function InvitePage({ token, info, me }: { token: string; info: InvitationInfo | null; me: Me | null }) {
  const go = useGo();
  const [error, setError] = useState<string | null>(null);
  if (!info) {
    return (
      <Card title="This invitation doesn't work" lead="It was used already, withdrawn, or it expired. Ask whoever sent it for a new one.">
        <Button variant="outline" asChild>
          <Link href="/">Go to Artbucket</Link>
        </Button>
      </Card>
    );
  }
  const where = info.resource === "organization" ? info.organization : `${info.label ?? "a " + info.resource} in ${info.organization}`;
  const accept = async (justSignedIn = false) => {
    const res = await fetch(`/api/v1/invite/${token}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    // A new account took the invitation as it was made: there is nothing left to accept.
    if (!res.ok && !justSignedIn) return setError(body.error?.message ?? "Couldn't accept it");
    if (body.data?.workspaceId) pickWorkspace(body.data.workspaceId);
    go("/");
  };
  // Signing up carries the invitation in a cookie; the account takes it as it is made.
  const leaveCookie = () => {
    document.cookie = `ab_invite=${encodeURIComponent(token)}; path=/; max-age=3600; samesite=lax`;
  };
  return (
    <Card
      title={`Join ${where}`}
      lead={
        <>
          <IconMailOpened className="mr-1 inline size-4" />
          {info.invitedBy} invited {info.email} to {SCOPE_WORDS[info.scope] ?? info.scope} ({info.scope}).
        </>
      }
    >
      {me?.user ? (
        <div className="grid gap-3">
          <p className="text-sm">
            Signed in as <span className="font-medium">{me.user.email}</span>.
          </p>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button onClick={() => void accept()}>Accept</Button>
          <Button variant="ghost" onClick={() => signOut(go)}>
            Not you? Sign out
          </Button>
        </div>
      ) : (
        <AuthForm
          mode={info.signUp ? "up" : "in"}
          signUp
          oidc={me?.auth.oidc ?? null}
          email={info.email}
          callbackURL={`/invite/${token}`}
          beforeSubmit={leaveCookie}
          then={() => void accept(true)}
        />
      )}
    </Card>
  );
}

/** /forgot-password: ask for a link. The answer is the same whether or not the email has an account. */
export function ForgotPassword() {
  const id = useId();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent) {
    return (
      <Card title="Check your email" lead="If that address has an account here, a link to choose a new password is on its way. It works for an hour.">
        <Button variant="outline" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </Card>
    );
  }
  return (
    <Card title="Reset your password" lead="We'll email you a link to choose a new one.">
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
          const r = await authPost("request-password-reset", { email, redirectTo: "/reset-password" });
          if (r.ok) setSent(true);
          else setError(r.message);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={id}>Email</Label>
          <Input id={id} name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit">Send the link</Button>
        <Link href="/login" className="text-muted-foreground text-center text-sm underline underline-offset-2">
          Back to sign in
        </Link>
      </form>
    </Card>
  );
}

/** /reset-password?token=: where the emailed link lands, through better-auth. */
export function ResetPassword({ token, invalid }: { token: string | null; invalid: boolean }) {
  const id = useId();
  const go = useGo();
  const [error, setError] = useState<string | null>(null);
  if (!token || invalid) {
    return (
      <Card title="This link doesn't work" lead="It was used already, or it expired. Ask for another one.">
        <Button variant="outline" asChild>
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </Card>
    );
  }
  return (
    <Card title="Choose a new password" lead="You'll be signed out everywhere else.">
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
          const r = await authPost("reset-password", { newPassword, token });
          if (!r.ok) return setError(r.message);
          go("/login");
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={id}>New password</Label>
          <Input id={id} name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
          <p className="text-muted-foreground text-xs">At least 10 characters.</p>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit">Save it and sign in</Button>
      </form>
    </Card>
  );
}
