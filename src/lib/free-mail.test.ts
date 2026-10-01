import assert from "node:assert/strict";
import { test } from "node:test";
import { freeMail } from "./free-mail.ts";

test("webmail, internet providers and throwaway inboxes are free mail; a company's domain is not", () => {
  for (const d of ["gmail.com", "GMX.de", "proton.me", "orange.fr.", "comcast.net", "outlook.com"]) assert.ok(freeMail(d), d);
  for (const d of ["acme.com", "blender.org", "artbucket.io"]) assert.ok(!freeMail(d), d);
});
