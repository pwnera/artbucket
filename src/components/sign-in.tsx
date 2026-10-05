"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { IconBuilding, IconCheck, IconKey, IconLogout, IconMail, IconRefresh, IconUsers } from "@tabler/icons-react";
import { toast } from "sonner";
import { MakeDialog, pickWorkspace, signOut, useGo, type Me } from "@/components/account";
import { BrandMark, useBrand } from "@/components/brand";
import type { Brand } from "@/lib/branding";
import { send } from "@/lib/send";
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
  // The Turnstile check (useTurnstile): not done yet, or refused.
  MISSING_RESPONSE: "Finish the check above the button, then try again.",
  VERIFICATION_FAILED: "The check above the button didn't pass. Try it again.",
};

type AuthResult = { ok: true; data: { url?: string; token?: string | null } } | { ok: false; message: string; code?: string };

/** `captcha`: a Turnstile token, for the calls lib/auth.ts guards with one. */
async function authPost(path: string, body: unknown, captcha?: string | null): Promise<AuthResult> {
  let res: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(captcha ? { "x-captcha-response": captcha } : {}) };
    res = await fetch(`/api/auth/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
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

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string | undefined;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
const turnstileApi = () => (window as { turnstile?: Turnstile }).turnstile;
let turnstileScript: Promise<Turnstile> | null = null;
/** Cloudflare's script, once, the first time a form needs it: never on pages that don't. */
function loadTurnstile() {
  return (turnstileScript ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => {
      const ts = turnstileApi();
      if (ts) resolve(ts);
      else reject(new Error("Turnstile didn't load"));
    };
    s.onerror = () => {
      turnstileScript = null;
      reject(new Error("Turnstile didn't load"));
    };
    document.head.append(s);
  }));
}

/**
 * The Turnstile widget (TURNSTILE_SITE_KEY, lib/auth.ts) in the element
 * `box` lands on, while `siteKey` is set. `take` hands over its token for one
 * guarded call and starts the widget over: a token is good once.
 */
function useTurnstile(siteKey: string | null, appearance: "always" | "interaction-only" = "always") {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const token = useRef<string | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!siteKey || !el) return;
    let gone = false;
    loadTurnstile()
      .then((ts) => {
        if (gone) return;
        widget.current = ts.render(el, {
          sitekey: siteKey,
          size: "flexible",
          appearance,
          callback: (t: string) => void (token.current = t),
          "expired-callback": () => void (token.current = null),
          "error-callback": () => void (token.current = null),
        });
      })
      // Blocked or offline: the server says the check is missing, and the form shows that.
      .catch(() => {});
    return () => {
      gone = true;
      if (widget.current) turnstileApi()?.remove(widget.current);
      widget.current = undefined;
      token.current = null;
    };
  }, [siteKey, appearance]);
  const take = () => {
    const t = token.current;
    token.current = null;
    if (widget.current) turnstileApi()?.reset(widget.current);
    return t;
  };
  return [box, take] as const;
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

/**
 * The page around a card, centred on it. With an `aside`, the page splits on
 * wide screens: the aside on the start side, the card on the end side.
 */
function Shell({ aside, children }: { aside?: React.ReactNode; children: React.ReactNode }) {
  const card = (
    <div className="bg-card text-card-foreground animate-in [overflow-wrap:anywhere] fade-in-0 slide-in-from-bottom-2 w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm duration-300 sm:p-8 dark:shadow-none">
      {children}
    </div>
  );
  if (!aside) {
    return <main className="bg-muted/40 dark:bg-background flex min-h-svh items-center justify-center px-4 py-8">{card}</main>;
  }
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {aside}
      <div className="bg-muted/40 dark:bg-background flex min-h-svh items-center justify-center px-4 py-8">{card}</div>
    </main>
  );
}

/** A card with the mark, for pages outside the app. Beside an `aside`, which carries the mark on wide screens. */
export function Card({
  title,
  lead,
  brand,
  aside,
  children,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  brand?: Brand;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Shell aside={aside}>
      <div className="space-y-3">
        <BrandMark brand={brand} className={aside ? "lg:hidden" : undefined} />
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

/** Google's own mark, in its colors: its sign-in buttons are to carry it. */
const GoogleG = () => (
  <svg viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

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
  google = false,
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
  aside,
  turnstile = null,
}: {
  heading: (mode: "in" | "up") => Heading;
  mode: "in" | "up";
  /** Whether signing up is on offer at all. */
  signUp: boolean;
  oidc: { name: string } | null;
  /** "Continue with Google" (GOOGLE_*). */
  google?: boolean;
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
  /** Beside the card on wide screens: see Shell. */
  aside?: React.ReactNode;
  /** Turnstile's site key (TURNSTILE_SITE_KEY): making an account takes its check. */
  turnstile?: string | null;
}) {
  const id = useId();
  const go = useGo();
  const [mode, setMode] = useState(initial);
  /**
   * The email first, with single sign-on beside it; the password (and on
   * sign-up, the rest) only once they go on with the email. One form all
   * along, so password managers see the address and the password together.
   */
  const [step, setStep] = useState<"email" | "password">("email");
  /** The address the second step is for, shown above the password. */
  const [shown, setShown] = useState("");
  const [busy, setBusy] = useState<"form" | "sso" | "google" | null>(null);
  const [error, setError] = useState<{ text: string; code?: string } | null>(initialError ? { text: initialError } : null);
  /** The address a code was just sent to (lib/auth.ts): the account signs in once it is entered. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The code step came from making an account, which may exist already: better-auth won't say. */
  const [fromUp, setFromUp] = useState(false);
  const [returned, setReturned] = useState(false);
  const values = useRef<Values>({ name: "", email: "", organization: "" });
  const emailInput = useCarriedEmail(!!fixed);
  const passwordInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [checkBox, takeCheck] = useTurnstile(mode === "up" && step === "password" ? turnstile : null);
  const done = () => (then ? then(values.current) : go(callbackURL));

  /** On to the password, or back to the email: focus follows, after the step paints. */
  const toStep = (to: "email" | "password") => {
    flushSync(() => {
      setStep(to);
      setError(null);
      if (to === "password") setShown(emailInput.current?.value.trim() ?? "");
    });
    const field = to === "email" ? emailInput.current : mode === "up" ? nameInput.current : passwordInput.current;
    field?.focus();
    if (to === "email") field?.select();
  };

  async function submit(form: FormData) {
    // The first step only asks for the address, which the browser checked: one whose organization has its own provider
    // goes there, any other on to the password. Not straight back to a provider that just failed: the password is the way round.
    if (step === "email") return void ((ssoOffered && !initialError && (await orgSso(true))) || toStep("password"));
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
        : await authPost("sign-up/email", { name: v.name || v.email.split("@")[0], email: v.email, password }, takeCheck());
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

  /** The server's own provider (`sso`, OIDC_*) or Google. */
  async function social(provider: "sso" | "google") {
    setBusy(provider);
    setError(null);
    beforeSubmit?.();
    const r = await authPost("sign-in/social", { provider: provider === "sso" ? "oidc" : provider, callbackURL, newUserCallbackURL: newUserURL, errorCallbackURL: errorURL });
    if (r.ok && r.data.url) return window.location.assign(r.data.url);
    setBusy(null);
    setError({ text: r.ok ? `${provider === "sso" ? "Single sign-on" : "Google"} isn't answering. Try again, or use your password.` : r.message });
  }

  /**
   * The organization's own provider, by the domain of the email typed. From
   * the email step `quiet`: false, and no error, when the domain has none.
   */
  async function orgSso(quiet = false) {
    const email = emailInput.current?.value.trim() ?? "";
    setBusy("form");
    setError(null);
    beforeSubmit?.();
    const r = await authPost("sign-in/sso", { email, callbackURL, newUserCallbackURL: newUserURL, errorCallbackURL: errorURL });
    if (r.ok && r.data.url) {
      window.location.assign(r.data.url);
      return true;
    }
    setBusy(null);
    const mine = r.ok || (r.code !== "NETWORK" && r.code !== "RATE_LIMITED");
    if (quiet && mine) return false;
    setError({ text: mine ? `${email.split("@")[1]} doesn't sign in with single sign-on here. Use your password, or ask your admin.` : r.message });
    return true;
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
      setStep(to ? "password" : "email");
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
    <Card title={h.title} lead={h.lead} aside={aside}>
      {/* Hidden, not unmounted, during the code step: going back finds everything as it was typed. */}
      <div hidden={!!confirming} className={cn("space-y-4", returned && "animate-in fade-in-0 slide-in-from-left-2 duration-200")}>
        {(oidc || google) && step === "email" && (
          <>
            {google && (
              <Button type="button" variant="outline" className="w-full" pending={busy === "google"} disabled={!!busy && busy !== "google"} onClick={() => void social("google")}>
                <GoogleG /> Continue with Google
              </Button>
            )}
            {oidc && (
              <Button type="button" variant="outline" className="w-full" pending={busy === "sso"} disabled={!!busy && busy !== "sso"} onClick={() => void social("sso")}>
                <IconKey /> Continue with {oidc.name}
              </Button>
            )}
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="bg-border h-px flex-1" /> or <span className="bg-border h-px flex-1" />
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
          {step === "password" && (
            <div className="animate-in fade-in-0 flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-sm duration-200">
              <IconMail className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{shown}</span>
              <button type="button" className={cn(TEXT_LINK, "text-muted-foreground hover:text-foreground shrink-0 text-xs")} onClick={() => toStep("email")}>
                Change
              </button>
            </div>
          )}
          {/* Kept on the second step, out of sight: it is the login a password manager saves with the password. */}
          <div className={step === "email" ? "grid gap-2" : "sr-only"} aria-hidden={step === "password" || undefined}>
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
              readOnly={step === "password"}
              tabIndex={step === "password" ? -1 : undefined}
              defaultValue={fixed}
              autoFocus={!fixed}
              placeholder="you@company.com"
              {...about(exists)}
            />
          </div>
          {step === "password" && (
            <div className="animate-in fade-in-0 slide-in-from-right-2 grid gap-4 duration-200">
              {mode === "up" && (
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-name`}>Name</Label>
                  <Input ref={nameInput} id={`${id}-name`} name="name" autoComplete="name" required maxLength={120} />
                </div>
              )}
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
                    You can change it later.
                  </p>
                </div>
              )}
            </div>
          )}
          {turnstile && mode === "up" && step === "password" && <div ref={checkBox} />}
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
                      flushSync(() => switchMode("in"));
                      passwordInput.current?.focus();
                    }}
                  >
                    Sign in instead
                  </button>
                </>
              )}
            </FormError>
          )}
          <Button type="submit" pending={busy === "form"} disabled={!!busy && busy !== "form"} autoFocus={!!fixed && step === "email"}>
            {step === "email" ? (
              <>
                <IconMail /> Continue with email
              </>
            ) : mode === "in" ? (
              "Sign in"
            ) : (
              "Make account"
            )}
          </Button>
        </form>
        {signUp && (
          <p className="text-muted-foreground text-center text-sm">
            {mode === "in" ? "New here? " : "Have an account? "}
            <button type="button" className={cn(TEXT_LINK, "text-foreground")} onClick={() => switchMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "Make an account" : "Sign in"}
            </button>
          </p>
        )}
        {mode === "in" && !forgot && step === "password" && (
          <p className="text-muted-foreground text-xs text-pretty">
            Forgot it? Ask an admin: this server can&apos;t email reset links yet.
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
          turnstile={turnstile}
        />
      )}
    </Card>
  );
}

/** The six digits mailed to a new account: pasted, typed or autofilled, it goes as soon as all six are in. */
function ConfirmEmail({
  email,
  onDone,
  onBack,
  onSignIn,
  turnstile,
}: {
  email: string;
  onDone: () => void;
  onBack: () => void;
  onSignIn?: () => void;
  /** A new code takes Turnstile's check too: out of sight unless it asks for a click. */
  turnstile: string | null;
}) {
  const id = useId();
  const [checkBox, takeCheck] = useTurnstile(turnstile, "interaction-only");
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
    const r = await authPost("email-otp/send-verification-otp", { email, type: "email-verification" }, takeCheck());
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
      {/* Last, out of the way: it only shows when Cloudflare wants a click before a new code goes. */}
      {turnstile && <div ref={checkBox} />}
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

/** What the product does, as the landing page puts it: the side of /login on wide screens. */
const POINTS = [
  "Find any asset in milliseconds, at any size or format, from one URL",
  "Guidelines as data: colors, type and logo rules, with history",
  "Portals for press, partners and retailers, on your own domain",
  "Agents get the same answers your team does, over MCP",
];
const AGENTS = ["Claude", "ChatGPT", "Gemini", "Cursor", "Figma"];

/**
 * The start side of /login, when nothing is customized: the mark, a promise
 * and what backs it. It holds self-hosted and on Artbucket Cloud alike:
 * nothing about whose server it is.
 */
function SignInAside() {
  return (
    <aside
      className="relative hidden overflow-hidden bg-zinc-950 text-zinc-50 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      style={{ backgroundImage: "radial-gradient(70% 55% at 0% 0%, color-mix(in oklab, var(--primary) 38%, transparent), transparent)" }}
    >
      <div className="flex items-center gap-3">
        <BrandMark />
        <span className="font-display text-lg font-semibold tracking-tight">Artbucket</span>
      </div>
      <div className="animate-in fade-in-0 slide-in-from-bottom-2 max-w-md space-y-8 duration-500">
        <div className="space-y-3">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-balance">Where brands live</h2>
          <p className="text-lg text-pretty text-zinc-300">
            Assets, guidelines and portals in one catalog. People and agents ask it the same question and get the same answer.
          </p>
        </div>
        <ul className="space-y-3">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-3 text-pretty text-zinc-200">
              <IconCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium text-zinc-400">Works with</p>
        <ul className="flex flex-wrap gap-2" aria-label="Agents it works with">
          {AGENTS.map((agent) => (
            <li key={agent} className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-sm text-zinc-300">
              {agent}
            </li>
          ))}
        </ul>
        <p className="pt-4 text-xs text-zinc-500">Open source. Your files and their metadata stay yours.</p>
      </div>
    </aside>
  );
}

/** /login: sign in, or on a fresh install set it up. */
export function SignInPage({ auth, next, error = false, up = false }: { auth: Me["auth"]; next?: string; error?: boolean; up?: boolean }) {
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
          ? { title: `Set up ${brand.name}`, lead: "This first account is the admin. Invite your team next." }
          : mode === "up"
            ? { title: `Join ${brand.name}`, lead: why ?? "Your account comes with an organization of its own." }
            : { title: `Sign in to ${brand.name}`, lead: why ?? brand.tagline ?? undefined }
      }
      // First run: making the account is all there is; nobody has one to sign in with. Sent to sign up (?mode=up): that form first.
      mode={first || (up && auth.open) ? "up" : "in"}
      signUp={!first && auth.open}
      oidc={auth.oidc}
      google={auth.google}
      sso={auth.sso}
      callbackURL={next || "/"}
      errorURL={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
      forgot={auth.passwordReset}
      organization={first}
      then={first ? (v) => void nameOrganization(v.organization).then(() => go(next || "/")) : undefined}
      error={error ? SSO_FAILED : undefined}
      below={!first && !auth.open ? "Accounts are by invitation: ask an admin." : undefined}
      // A renamed or restyled install gets the card alone: the aside is the product's own pitch.
      aside={brand.custom ? undefined : <SignInAside />}
      turnstile={auth.turnstile}
    />
  );
}

/** /login when the API didn't answer: a sign-in form would read as being signed out. */
export function Unreachable() {
  const brand = useBrand();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card title={`Can't reach ${brand.name} right now`} lead="It may be restarting. Try again in a moment.">
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
  const offer = me.joinable;
  const [joining, setJoining] = useState(false);
  const join = async () => {
    setJoining(true);
    const ok = await send("POST", "/api/v1/join");
    if (!ok) return setJoining(false);
    // Somewhere to be now: /welcome sends them on. Busy until it does.
    router.refresh();
  };
  return (
    <Card
      title={`Welcome, ${me.user?.name || me.user?.email}`}
      lead={
        offer
          ? `Your ${offer.domain} address can join ${offer.organization.name}, or start your own.`
          : "No workspace yet. Ask an admin for an invitation, or start your own."
      }
    >
      <div className="grid gap-2">
        {offer && (
          <Button pending={joining} onClick={() => void join()}>
            <IconUsers /> Join {offer.organization.name}
          </Button>
        )}
        <Button variant={offer ? "outline" : "default"} onClick={() => setMaking(true)}>
          <IconBuilding /> {offer ? "Start my own" : "Make an organization"}
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
        lead="It was used, withdrawn or expired. Made your account with it? Sign in. Otherwise ask for a new one."
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
      google={!!me?.auth.google}
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
      turnstile={me?.auth.turnstile ?? null}
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
        lead="This server can't email a reset link yet. Ask an admin to set a new password for you."
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
