import assert from "node:assert/strict";
import { test } from "node:test";
import { signLines, signsIn } from "./site-safety.ts";

const page = (html: string) => () => html;

test("a fake sign-in page is a sign, and says whose it copies", () => {
  const fake = `<title>Sign in to your account</title><h1>Microsoft</h1><form action="https://collect.example/p.php" method="post"><input type="email" name="login"><input type=password name="passwd"></form>`;
  assert.deepEqual(signsIn("index.html", page(fake)), [{ file: "index.html", why: "asks for a password, on a page that looks like Microsoft's" }]);
  // A project with a Microsoft brand is Microsoft: still a password, not a lookalike.
  assert.deepEqual(signsIn("index.html", page(fake), ["Microsoft Brand"]), [{ file: "index.html", why: "asks for a password" }]);
});

test("cards, recovery phrases and programs are signs", () => {
  assert.equal(signsIn("pay.html", page(`<input autocomplete="cc-number">`))[0].why, "asks for card details");
  assert.equal(signsIn("pay.htm", page(`<input name="cvv">`))[0].why, "asks for card details");
  assert.equal(signsIn("claim.html", page(`<p>Connect your wallet and enter your 12-word recovery phrase</p>`))[0].why, "asks for a wallet's recovery phrase");
  assert.deepEqual(signsIn("download/setup.exe", page("")), [{ file: "download/setup.exe", why: "a program to download and run" }]);
});

test("a brand's site is not: a newsletter form, docs about signing in with Google, scripts and images", () => {
  const docs = `<h1>Sign in with Google</h1><p>Log in with your Google account.</p><form action="https://list.example/subscribe"><input type="email" name="email"><button>Subscribe</button></form>`;
  assert.deepEqual(signsIn("docs/auth.html", page(docs)), []);
  // Only pages are read: a bundle that renders a login form is a component library, not a page asking.
  let read = false;
  assert.deepEqual(
    signsIn("assets/app.js", () => ((read = true), `{type:"password"}`)),
    [],
  );
  assert.equal(read, false);
  assert.deepEqual(signsIn("logo.png", page("")), []);
  assert.deepEqual(signLines([{ file: "a.html", why: "asks for a password" }]), ["a.html asks for a password"]);
});

test("a page of unclosed tags is read in linear time", () => {
  for (const unit of ["<input ", "<script ", "<style ", "<"]) {
    const page = unit.repeat(300_000);
    const t = Date.now();
    signsIn("a.html", () => page);
    assert.ok(Date.now() - t < 1500, `${unit.trim()}: ${Date.now() - t} ms`);
  }
});
