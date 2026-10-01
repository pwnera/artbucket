"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { IconBuilding, IconKey, IconLogout, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";
import { MakeDialog, pickWorkspace, signOut, useGo, type Me } from "@/components/account";
import { BrandMark, useBrand } from "@/components/brand";
import type { Brand } from "@/lib/branding";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Waiting } from "@/components/waiting";
import { shake, useKept } from "@/lib/motion";

/**
 * Signing in and up, against better-auth at /api/auth: who someone is. What
 * they may do is /api/v1's business, and every page asks it.
 */

export const UNREACHABLE = "Couldn't reach the server. Check your connection and try again.";
const SSO_FAILED = "Single sign-on didn't finish. Try again, or use your password.";

/** better-auth's messages by code, said as what to do next. */
const COPY: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check both and try again.",
  USER_ALREADY_EXISTS: "There's already an account with this email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There's already an account with this email.",
  PASSWORD_TOO_SHORT: "Use at least 10 characters.",
  INVALID_OTP: "That code isn't right. Check the email and try again.",
  OTP_EXPIRED: "That code expired. Send a new one below.",
  TOO_MANY_ATTEMPTS: "Too many wrong codes. Send a new one below.",
  INVALID_TOKEN: "This link expired or was used already. Ask for a new one.",
  // Signed in from an address other than the server's own (APP_URL): a proxy, an IP, a second hostname.
  INVALID_ORIGIN: "This page isn't at the address the server is set up for (its APP_URL). Open it there, or ask its operator, then try again.",
};

type AuthResult = { ok: true; data: { url?: string; token?: string | null } } | { ok: false; message: string; code?: string };

async function authPost(path: string, body: unknown): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, code: "NETWORK", message: UNREACHABLE };
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: json };
  if (res.status === 429) {
    // better-auth's own limit says X-Retry-After; the app's (proxy.ts) says Retry-After.
    const wait = res.headers.get("X-Retry-After") ?? res.headers.get("Retry-After");
    return { ok: false, code: "RATE_LIMITED", message: `Too many tries. Wait ${wait ? `${wait}s` : "a minute"}, then try again.` };
  }
  return { ok: false, code: json.code, message: COPY[json.code] ?? json.message ?? json.error?.message ?? "That didn't work. Try again." };
}

/**
 * The address typed on one auth page, carried to the next in the tab's
 * storage: never the URL, where it would land in logs and history.
 */
const EMAIL = "ab:email";
function keepEmail(email: string | undefined) {
  try {
    if (email?.trim()) sessionStorage.setItem(EMAIL, email.trim());
  } catch {
    // Storage off: the next page just starts empty.
  }
}
/** A ref for an email field, filled with the carried address if empty, after hydration: the server has no storage. */
function useCarriedEmail(skip = false) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (skip || !el || el.value) return;
    try {
      el.value = sessionStorage.getItem(EMAIL) ?? "";
    } catch {
      // Storage off: type it.
    }
  }, [skip]);
  return input;
}

/** Seconds until a code or link may go again: better-auth sends three a minute, then refuses. */
function useCooldown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(30)] as const;
}

/** A text button or link, tall enough to tap. */
const TEXT_LINK = "inline-flex min-h-6 items-center underline underline-offset-2 disabled:no-underline disabled:opacity-70";

/** An error under a form: announced as it appears, and named by id from the field it is about. */
export function FormError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="text-destructive animate-in fade-in-0 slide-in-from-top-1 text-sm text-pretty duration-200">
      {children}
    </p>
  );
}

/** The page around a card: anchored near the top, so what grows below never moves what's above. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/40 dark:bg-background flex min-h-svh items-start justify-center px-4 pt-[12svh] pb-8 sm:pt-[18svh]">
      <div className="bg-card text-card-foreground animate-in [overflow-wrap:anywhere] fade-in-0 slide-in-from-bottom-2 w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm duration-300 sm:p-8 dark:shadow-none">
        {children}
      </div>
    </main>
  );
}

/** A card with the mark, for pages outside the app. */
export function Card({ title, lead, brand, children }: { title: React.ReactNode; lead?: React.ReactNode; brand?: Brand; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="space-y-3">
        <BrandMark brand={brand} />
        {/* Keyed on what they say, so a new step's words fade in rather than swap. */}
        <h1 key={typeof title === "string" ? title : undefined} className="font-display animate-in fade-in-0 text-xl font-semibold tracking-tight duration-200">
          {title}
        </h1>
        {lead && (
          <div key={typeof lead === "string" ? lead : undefined} className="text-muted-foreground animate-in fade-in-0 text-sm text-pretty duration-200">
            {lead}
          </div>
        )}
      </div>
      {children}
    </Shell>
  );
}

type Heading = { title: string; lead?: React.ReactNode };
/** What the form held when it went: `then` reads it, after the code step too. */
type Values = { name: string; email: string; organization: string };

/**
 * Email and password, one way or the other, and single sign-on when there
 * is some, in its own card: the heading follows the mode and the step.
 * `then` runs once signed in; by default, `callbackURL`.
 */
export function AuthForm({
  heading,
  mode: initial,
  signUp,
  oidc,
  sso: ssoOffered = false,
  email: fixed,
  callbackURL = "/",
  newUserURL,
  errorURL,
  beforeSubmit,
  then,
  forgot = false,
  organization = false,
  error: initialError,
  below,
}: {
  heading: (mode: "in" | "up") => Heading;
  mode: "in" | "up";
  /** Whether signing up is on offer at all. */
  signUp: boolean;
  oidc: { name: string } | null;
  /** Some organization signs its people in through its own provider: found by the email's domain. */
  sso?: boolean;
  /** From an invitation: filled in. */
  email?: string;
  /** Where single sign-on returns, and where the form goes without `then`. */
  callbackURL?: string;
  /** Where single sign-on returns an account it just made. */
  newUserURL?: string;
  /** Where single sign-on returns when it fails, rather than better-auth's own page. */
  errorURL?: string;
  /** Runs before either form or SSO goes: an invitation leaves its cookie. */
  beforeSubmit?: () => void;
  then?: (values: Values) => void;
  /** Offer "Forgot password?": some email can go out. Without it, sign-in says who can help. */
  forgot?: boolean;
  /** First run: name the organization while making its admin. */
  organization?: boolean;
  /** Shown from the start: single sign-on sent them back with one. */
  error?: string;
  /** A muted line under the form. */
  below?: React.ReactNode;
}) {
  const id = useId();
  const go = useGo();
  const [mode, setMode] = useState(initial);
  const [busy, setBusy] = useState<"form" | "sso" | "org" | null>(null);
  const [error, setError] = useState<{ text: string; code?: string } | null>(initialError ? { text: initialError } : null);
  /** The address a code was just sent to (lib/auth.ts): the account signs in once it is entered. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The code step came from making an account, which may exist already: better-auth won't say. */
  const [fromUp, setFromUp] = useState(false);
  const [returned, setReturned] = useState(false);
  const values = useRef<Values>({ name: "", email: "", organization: "" });
  const emailInput = useCarriedEmail(!!fixed);
  const passwordInput = useRef<HTMLInputElement>(null);
  const done = () => (then ? then(values.current) : go(callbackURL));

  async function submit(form: FormData) {
    const v: Values = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      organization: String(form.get("organization") ?? "").trim(),
    };
    const password = String(form.get("password") ?? "");
    values.current = v;
    setBusy("form");
    setError(null);
    beforeSubmit?.();
    const r =
      mode === "in"
        ? await authPost("sign-in/email", { email: v.email, password })
        : await authPost("sign-up/email", { name: v.name || v.email.split("@")[0], email: v.email, password });
    // Made, or known but unconfirmed: either way a code is on its way.
    if ((r.ok && mode === "up" && !r.data.token) || (!r.ok && r.code === "EMAIL_NOT_VERIFIED")) {
      setBusy(null);
      setFromUp(mode === "up");
      return setConfirming(v.email);
    }
    // The address's organization signs in through its own provider: go there with it.
    if (!r.ok && r.code === "SSO_REQUIRED") return void (await orgSso());
    if (!r.ok) {
      setBusy(null);
      setError({ text: r.message, code: r.code });
      if (r.code === "INVALID_EMAIL_OR_PASSWORD") {
        passwordInput.current?.focus();
        passwordInput.current?.select();
        shake(passwordInput.current?.closest("form"));
      }
      return;
    }
    // Busy until the next page paints: a second click would only spend better-auth's three tries.
    done();
  }

  async function sso() {
    setBusy("sso");
    setError(null);
    beforeSubmit?.();
    const r = await authPost("sign-in/social", { provider: "oidc", callbackURL, newUserCallbackURL: newUserURL, errorCallbackURL: errorURL });
    if (r.ok && r.data.url) return window.location.assign(r.data.url);
    setBusy(null);
    setError({ text: r.ok ? "Single sign-on isn't answering. Try again, or use your password." : r.message });
  }

  /** The organization's own provider, by the domain of the email typed above. */
  async function orgSso() {
    const field = emailInput.current;
    const email = field?.value.trim() ?? "";
    if (!field || !email || !field.checkValidity()) {
      setError({ text: "Type your work email above first." });
      field?.focus();
      return;
    }
    setBusy("org");
    setError(null);
    beforeSubmit?.();
    const r = await authPost("sign-in/sso", { email, callbackURL, newUserCallbackURL: newUserURL, errorCallbackURL: errorURL });
    if (r.ok && r.data.url) return window.location.assign(r.data.url);
    setBusy(null);
    const mine = r.ok || (r.code !== "NETWORK" && r.code !== "RATE_LIMITED");
    setError({ text: mine ? `${email.split("@")[1]} doesn't sign in with single sign-on here. Use your password, or ask your admin.` : r.message });
  }

  const switchMode = (to: "in" | "up") => {
    setMode(to);
    setError(null);
  };

  /** Back from the code to the form, which kept everything: to fix the email, or to sign in instead. */
  const leaveCode = (to?: "in") => {
    flushSync(() => {
      setConfirming(null);
      setReturned(true);
      if (to) switchMode(to);
    });
    const field = to ? passwordInput.current : emailInput.current;
    field?.focus();
    field?.select();
  };

  const errorId = `${id}-error`;
  const exists = !!error?.code?.startsWith("USER_ALREADY_EXISTS");
  const about = (on: boolean) => (on ? { "aria-invalid": true, "aria-describedby": errorId } : {});
  const h: Heading = confirming
    ? {
        title: "Check your email",
        lead: (
          <>
            We sent a 6-digit code to <span className="text-foreground font-medium">{confirming}</span>.
          </>
        ),
      }
    : heading(mode);

  return (
    <Card title={h.title} lead={h.lead}>
      {/* Hidden, not unmounted, during the code step: going back finds everything as it was typed. */}
      <div hidden={!!confirming} className={cn("space-y-4", returned && "animate-in fade-in-0 slide-in-from-left-2 duration-200")}>
        {oidc && (
          <>
            <Button type="button" variant="outline" className="w-full" pending={busy === "sso"} disabled={!!busy && busy !== "sso"} onClick={() => void sso()}>
              <IconKey /> Continue with {oidc.name}
            </Button>
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="bg-border h-px flex-1" /> or with a password <span className="bg-border h-px flex-1" />
            </div>
          </>
        )}
        <form
          className="grid gap-4"
          onChange={() => error && setError(null)}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
        >
          {mode === "up" && (
            <div className="animate-in fade-in-0 slide-in-from-top-1 grid gap-2 duration-200">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input id={`${id}-name`} name="name" autoComplete="name" required maxLength={120} autoFocus />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input
              ref={emailInput}
              id={`${id}-email`}
              name="email"
              type="email"
              // Paired with current-password, password managers save and fill it as the login.
              autoComplete={mode === "in" ? "username" : "email"}
              autoCapitalize="none"
              spellCheck={false}
              required
              defaultValue={fixed}
              autoFocus={mode === "in" && !fixed}
              {...about(exists)}
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${id}-password`}>Password</Label>
              {mode === "in" && forgot && (
                <Link
                  href="/forgot-password"
                  onClick={() => keepEmail(emailInput.current?.value)}
                  className="text-muted-foreground hover:text-foreground inline-flex min-h-6 items-center text-xs underline underline-offset-2"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <PasswordInput
              ref={passwordInput}
              id={`${id}-password`}
              name="password"
              required
              minLength={mode === "up" ? 10 : undefined}
              showLength={mode === "up" ? 10 : undefined}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              autoFocus={mode === "in" && !!fixed}
              {...about(error?.code === "INVALID_EMAIL_OR_PASSWORD")}
            />
          </div>
          {mode === "up" && organization && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-org`}>Organization</Label>
              <Input
                id={`${id}-org`}
                name="organization"
                autoComplete="organization"
                maxLength={80}
                placeholder="Acme"
                aria-describedby={`${id}-org-hint`}
              />
              <p id={`${id}-org-hint`} className="text-muted-foreground text-xs">
                What your team is called. You can change it later.
              </p>
            </div>
          )}
          {error && (
            <FormError id={errorId}>
              {error.text}
              {exists && mode === "up" && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-foreground underline underline-offset-2"
                    onClick={() => {
                      switchMode("in");
                      passwordInput.current?.focus();
                    }}
                  >
                    Sign in instead
                  </button>
                </>
              )}
            </FormError>
          )}
          <Button type="submit" pending={busy === "form"} disabled={!!busy && busy !== "form"}>
            {mode === "in" ? "Sign in" : "Make account"}
          </Button>
          {ssoOffered && (
            <Button type="button" variant="outline" pending={busy === "org"} disabled={!!busy && busy !== "org"} onClick={() => void orgSso()}>
              <IconBuilding /> Sign in with SSO
            </Button>
          )}
        </form>
        {signUp && (
          <p className="text-muted-foreground text-center text-sm">
            {mode === "in" ? "New here? " : "Have an account? "}
            <button type="button" className={cn(TEXT_LINK, "text-foreground")} onClick={() => switchMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "Make an account" : "Sign in"}
            </button>
          </p>
        )}
        {mode === "in" && !forgot && (
          <p className="text-muted-foreground text-xs text-pretty">
            Forgot your password? This server can&apos;t email a reset link yet. An admin can turn on email in Settings.
          </p>
        )}
        {below && <p className="text-muted-foreground text-xs text-pretty">{below}</p>}
      </div>
      {confirming && (
        <ConfirmEmail
          key={confirming}
          email={confirming}
          onDone={done}
          onBack={() => leaveCode()}
          onSignIn={fromUp && signUp ? () => leaveCode("in") : undefined}
        />
      )}
    </Card>
  );
}

/** The six digits mailed to a new account: pasted, typed or autofilled, it goes as soon as all six are in. */
function ConfirmEmail({ email, onDone, onBack, onSignIn }: { email: string; onDone: () => void; onBack: () => void; onSignIn?: () => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  // One just went out with the account.
  const [wait, restart] = useCooldown(30);

  async function confirm(otp: string) {
    setBusy(true);
    setNote(null);
    const r = await authPost("email-otp/verify-email", { email, otp });
    if (r.ok) return onDone();
    setBusy(false);
    setNote({ error: true, text: r.message });
    // Selected, so the next try replaces it.
    input.current?.focus();
    input.current?.select();
  }

  async function resend() {
    setSending(true);
    const r = await authPost("email-otp/send-verification-otp", { email, type: "email-verification" });
    setSending(false);
    if (r.ok) restart();
    setNote(r.ok ? { error: false, text: "A new code is on its way." } : { error: true, text: r.message });
  }

  return (
    <form
      className="animate-in fade-in-0 slide-in-from-right-2 grid gap-4 duration-200"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6 && !busy) void confirm(code);
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`${id}-code`}>Code</Label>
        <Input
          ref={input}
          id={`${id}-code`}
          name="code"
          value={code}
          onChange={(e) => {
            // "123 456" and "123-456" paste as the six digits they are.
            const next = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            if (note?.error) setNote(null);
            // Sent from the change itself, which a paste and one-time-code autofill both make.
            if (next.length === 6 && next !== code && !busy) void confirm(next);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          readOnly={busy}
          aria-invalid={note?.error || undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          className="font-mono text-lg tracking-[0.4em]"
        />
      </div>
      {note &&
        (note.error ? (
          <FormError id={`${id}-note`}>{note.text}</FormError>
        ) : (
          <p id={`${id}-note`} role="status" className="text-muted-foreground text-sm">
            {note.text}
          </p>
        ))}
      <Button type="submit" pending={busy} disabled={code.length < 6}>
        Confirm
      </Button>
      <p className="text-muted-foreground flex justify-between gap-2 text-sm">
        <button type="button" className={TEXT_LINK} onClick={onBack}>
          Back
        </button>
        <button type="button" className={TEXT_LINK} disabled={wait > 0 || sending} onClick={() => void resend()}>
          {sending ? "Sending…" : wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
      </p>
      {onSignIn && (
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <button type="button" className={cn(TEXT_LINK, "text-foreground")} onClick={onSignIn}>
            Sign in instead
          </button>
        </p>
      )}
    </form>
  );
}

/** First run: the seeded organization is "Default" until named. Best effort: Settings can rename it any time. */
async function nameOrganization(name: string) {
  if (!name) return;
  try {
    const me = await fetch("/api/v1/me").then((r) => r.json());
    const org = me?.data?.workspace?.organization?.id;
    if (org) {
      await fetch(`/api/v1/organizations/${encodeURIComponent(org)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    }
  } catch {
    // Left as it was: nothing here is worth holding up the first sign-in.
  }
}

/** /login: sign in, or on a fresh install set it up. */
export function SignInPage({ auth, next, error = false }: { auth: Me["auth"]; next?: string; error?: boolean }) {
  const first = auth.signUp;
  const brand = useBrand();
  const go = useGo();
  // Sent here from connecting an agent or the CLI: say so, so it reads as part of what they started.
  const why = next?.startsWith("/oauth/authorize")
    ? `Sign in to connect your agent to ${brand.name}.`
    : next?.startsWith("/device")
      ? "Sign in to approve the CLI."
      : undefined;
  return (
    <AuthForm
      heading={(mode) =>
        first
          ? { title: `Set up ${brand.name}`, lead: "This first account is the admin of everything. You can invite your team next." }
          : mode === "up"
            ? { title: `Join ${brand.name}`, lead: why ?? "Your account comes with an organization of its own." }
            : { title: `Sign in to ${brand.name}`, lead: why ?? brand.tagline ?? undefined }
      }
      // First run: making the account is all there is; nobody has one to sign in with.
      mode={first ? "up" : "in"}
      signUp={!first && auth.open}
      oidc={auth.oidc}
      sso={auth.sso}
      callbackURL={next || "/"}
      errorURL={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
      forgot={auth.passwordReset}
      organization={first}
      then={first ? (v) => void nameOrganization(v.organization).then(() => go(next || "/")) : undefined}
      error={error ? SSO_FAILED : undefined}
      below={!first && !auth.open ? "Accounts are by invitation: ask an admin for a link if you don't have one." : undefined}
    />
  );
}

/** /login when the API didn't answer: a sign-in form would read as being signed out. */
export function Unreachable() {
  const brand = useBrand();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card title={`Can't reach ${brand.name} right now`} lead="The server didn't answer. It may be restarting: try again in a moment.">
      <Button className="w-full" pending={pending} onClick={() => start(() => router.refresh())}>
        <IconRefresh /> {pending ? "Trying…" : "Try again"}
      </Button>
    </Card>
  );
}

/** /welcome: signed in, with nowhere to be yet. Asks again now and then; the server sends them on once there is somewhere. */
export function Welcome({ me }: { me: Me }) {
  const go = useGo();
  const router = useRouter();
  const [making, setMaking] = useState(false);
  const shownMaking = useKept(making || null);
  useEffect(() => {
    const look = () => document.visibilityState === "visible" && router.refresh();
    const every = setInterval(look, 30_000);
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      clearInterval(every);
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, [router]);
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
      <Waiting what="This page moves on by itself once you have access" />
      {shownMaking && <MakeDialog kind="organization" open={making} onClose={() => setMaking(false)} />}
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

const SCOPE_WORDS: Record<string, string> = { read: "look around", propose: "suggest additions", write: "edit", admin: "manage everything" };

/**
 * /invite/{token}: what it offers, then sign up, sign in, or just accept.
 * `accept` is single sign-on coming back with an account that existed: it
 * accepts once, as the click would have.
 */
export function InvitePage({
  token,
  info,
  me,
  accept: auto = false,
  error: ssoError = false,
}: {
  token: string;
  info: InvitationInfo | null;
  me: Me | null;
  accept?: boolean;
  error?: boolean;
}) {
  const go = useGo();
  const [busy, setBusy] = useState<"accept" | "out" | null>(auto && me?.user && info ? "accept" : null);
  const [error, setError] = useState<string | null>(null);
  const joined = useRef(false);
  const started = useRef(false);
  const where = !info
    ? ""
    : info.resource === "organization"
      ? info.organization
      : `${info.label ?? (info.resource === "asset" ? "an asset" : `a ${info.resource}`)} in ${info.organization}`;

  const accept = async (justSignedIn = false) => {
    setBusy("accept");
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/v1/invite/${encodeURIComponent(token)}`, { method: "POST" });
    } catch {
      // Signed in by now: the page comes back with an Accept button.
      if (justSignedIn) return go(`/invite/${token}`);
      setBusy(null);
      return setError(UNREACHABLE);
    }
    const body = await res.json().catch(() => ({}));
    // A new account took the invitation as it was made, and one accepted already is gone: either way, a 404 leaves nothing to accept.
    if (!res.ok && !((justSignedIn || joined.current) && res.status === 404)) {
      const message = body.error?.message ?? "Couldn't accept it. Try again.";
      // Signed in by now: the page comes back with an Accept button, and the toast says why it's still there.
      if (justSignedIn) {
        toast.error(message);
        return go(`/invite/${token}`);
      }
      setBusy(null);
      return setError(message);
    }
    joined.current = true;
    if (body.data?.workspaceId) pickWorkspace(body.data.workspaceId);
    toast.success(`You joined ${where}`, { id: "joined" });
    go("/");
  };

  useEffect(() => {
    // A ref, not state: StrictMode runs this twice, and a second POST would find the invitation taken.
    if (!auto || !me?.user || !info || started.current) return;
    started.current = true;
    void accept();
    // Once, on arrival: `accept` is new every render and would only re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, me, info]);

  if (!info) {
    return (
      // Taken as the account was made, before its email was confirmed: the person who used it signs in, the code then finishes it.
      <Card
        title="This invitation doesn't work"
        lead="It was used already, withdrawn, or it expired. If you made your account with it, sign in: you're in. Otherwise ask whoever sent it for a new one."
      >
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </Card>
    );
  }

  // Signing up carries the invitation in a cookie; the account takes it as it is made.
  const leaveCookie = () => {
    document.cookie = `ab_invite=${encodeURIComponent(token)}; path=/; max-age=3600; samesite=lax`;
  };
  const switchAccount = async () => {
    setBusy("out");
    setError(null);
    const r = await authPost("sign-out", {});
    if (!r.ok) {
      setBusy(null);
      return setError(r.message);
    }
    // Back here, signed out: the invitation is still what they came for.
    go(`/invite/${token}`);
  };
  const lead = (
    <>
      {info.invitedBy} invited you to {SCOPE_WORDS[info.scope] ?? info.scope}.
      <span className="mt-1 block text-xs" suppressHydrationWarning>
        Sent to {info.email} · Expires {ago(info.expiresAt)}
      </span>
    </>
  );

  if (me?.user) {
    const other = me.user.email.toLowerCase() !== info.email.toLowerCase();
    return (
      <Card title={`Join ${where}`} lead={lead}>
        <div className="grid gap-3">
          <p className="text-sm">
            Signed in as <span className="font-medium">{me.user.email}</span>.
          </p>
          {other && (
            <p className="border-warning/30 bg-warning/10 text-warning rounded-md border px-3 py-2 text-sm text-pretty">
              This was sent to {info.email}. You&apos;ll join as {me.user.email}.
            </p>
          )}
          {error && <FormError>{error}</FormError>}
          <Button pending={busy === "accept"} disabled={busy === "out"} onClick={() => void accept()}>
            Accept
          </Button>
          <Button variant="ghost" pending={busy === "out"} disabled={busy === "accept"} onClick={() => void switchAccount()}>
            Not you? Sign out
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <AuthForm
      heading={() => ({ title: `Join ${where}`, lead })}
      mode={info.signUp ? "up" : "in"}
      signUp
      oidc={me?.auth.oidc ?? null}
      sso={!!me?.auth.sso}
      email={info.email}
      // A new single sign-on account took the invitation as it was made; one that existed comes back to accept it.
      callbackURL={`/invite/${token}?accept=1`}
      newUserURL="/"
      errorURL={`/invite/${token}`}
      beforeSubmit={leaveCookie}
      then={() => void accept(true)}
      forgot={!!me?.auth.passwordReset}
      error={ssoError ? SSO_FAILED : undefined}
    />
  );
}

/** /forgot-password: ask for a link. The answer is the same whether or not the email has an account. */
export function ForgotPassword({ canSend }: { canSend: boolean }) {
  const id = useId();
  const input = useCarriedEmail();
  /** The address last sent to; the sent screen shows while `sent`. */
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wait, restart] = useCooldown(0);

  async function send(to: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    keepEmail(to);
    const r = await authPost("request-password-reset", { email: to, redirectTo: "/reset-password" });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    restart();
    if (sent) setNote("Sent again.");
    setEmail(to);
    setSent(true);
  }

  if (!canSend) {
    return (
      <Card
        title="Reset your password"
        lead="This server can't email a reset link yet. An admin can turn on email in Settings, or set a new password for you."
      >
        <Button variant="outline" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </Card>
    );
  }
  if (sent) {
    return (
      <Card
        title="Check your email"
        lead={
          <>
            If <span className="text-foreground font-medium">{email}</span> has an account here, a link to choose a new password is on its way. It
            works for an hour.
          </>
        }
      >
        <div className="animate-in fade-in-0 slide-in-from-right-2 grid gap-3 duration-200">
          {error && <FormError>{error}</FormError>}
          {note && (
            <p role="status" className="text-muted-foreground text-sm">
              {note}
            </p>
          )}
          <Button variant="outline" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
          <p className="text-muted-foreground flex flex-wrap justify-between gap-2 text-sm">
            <button
              type="button"
              className={TEXT_LINK}
              onClick={() => {
                setSent(false);
                setError(null);
                setNote(null);
              }}
            >
              Use a different email
            </button>
            <button type="button" className={TEXT_LINK} disabled={busy || wait > 0} onClick={() => void send(email)}>
              {busy ? "Sending…" : wait > 0 ? `Send again in ${wait}s` : "Didn't get it? Send again"}
            </button>
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Reset your password" lead="We'll email you a link to choose a new one.">
      <form
        className="grid gap-4"
        onChange={() => error && setError(null)}
        onSubmit={(e) => {
          e.preventDefault();
          void send(String(new FormData(e.currentTarget).get("email") ?? "").trim());
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={id}>Email</Label>
          <Input
            ref={input}
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            defaultValue={email}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
        {error && <FormError id={`${id}-error`}>{error}</FormError>}
        <Button type="submit" pending={busy}>
          Send the link
        </Button>
        <Link
          href="/login"
          onClick={() => keepEmail(input.current?.value)}
          className="text-muted-foreground mx-auto inline-flex min-h-6 items-center text-sm underline underline-offset-2"
        >
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
  const [busy, setBusy] = useState(false);
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
        onChange={() => error && setError(null)}
        onSubmit={async (e) => {
          e.preventDefault();
          const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
          setBusy(true);
          setError(null);
          const r = await authPost("reset-password", { newPassword, token });
          if (!r.ok) {
            setBusy(false);
            return setError(r.message);
          }
          // Resetting doesn't sign in (better-auth): say it worked, then the sign-in form. The root Toaster outlives the navigation.
          toast.success("Password changed. Sign in with the new one.");
          go("/login");
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={id}>New password</Label>
          <PasswordInput
            id={id}
            name="password"
            autoComplete="new-password"
            minLength={10}
            showLength={10}
            required
            autoFocus
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
        {error && <FormError id={`${id}-error`}>{error}</FormError>}
        <Button type="submit" pending={busy}>
          Save new password
        </Button>
      </form>
    </Card>
  );
}
