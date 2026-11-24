import assert from "node:assert/strict";
import { test } from "node:test";
import { describeCaller } from "@/lib/core/access";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { signUp } from "@/test/db";

/** A POST to better-auth at the server's own address, as the sign-in form does. */
const post = (path: string, body: unknown) =>
  auth.handler(
    new Request(new URL(`/api/auth/${path}`, process.env.APP_URL), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(process.env.APP_URL!).origin },
      body: JSON.stringify(body),
    }),
  );

test("PASSWORD_LOGIN=off refuses signing in with a password, and /me says so", async (t) => {
  const ada = await signUp("Ada");
  const was = env.PASSWORD_LOGIN;
  env.PASSWORD_LOGIN = "off";
  t.after(() => void (env.PASSWORD_LOGIN = was));
  const r = await post("sign-in/email", { email: "no-one@example.com", password: "correct horse battery" });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, "PASSWORD_LOGIN_OFF");
  // The answer the sign-in page reads: the password form goes away with the switch.
  const me = await describeCaller(ada.caller, new URL(process.env.APP_URL!).host);
  assert.equal(me.auth.passwordSignIn, false);
});

test("with the switch left alone, signing in with a password answers as it always did", async () => {
  const r = await post("sign-in/email", { email: "no-one@example.com", password: "correct horse battery" });
  // No such account: better-auth's own answer, not the switch's refusal.
  assert.notEqual((await r.json()).code, "PASSWORD_LOGIN_OFF");
});
