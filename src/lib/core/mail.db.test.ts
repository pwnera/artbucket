import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { plan, signUp } from "@/test/db";
import { sendAs, testEmail } from "@/lib/core/mail";
import { updateSetting } from "@/lib/core/settings";

// The console provider prints each message: not in the test's output.
mock.method(console, "info", () => {});

const ada = await signUp("Ada");
const grace = await signUp("Grace");
for (const { caller } of [ada, grace]) {
  await updateSetting(caller, "organization", "email", { enabled: true, provider: "console", from: "Test <test@example.com>" });
  await plan(caller.workspace.organizationId, { emails: 2 });
}
const send = (who: typeof ada, options?: { capped: boolean }) => sendAs(who.caller.workspace.organizationId, testEmail("someone@example.com", "Test", "http://localhost:3000"), options);

test("an organization sends its emails for the day, then is refused, and another organization's count is its own", async () => {
  assert.deepEqual(await send(ada), { sent: true });
  assert.deepEqual(await send(ada), { sent: true });
  const third = await send(ada);
  assert.equal(third.sent, false);
  assert.equal(third.limited, true);
  assert.match(third.error ?? "", /sent its 2 emails for today/);
  assert.deepEqual(await send(grace), { sent: true });
});

test("mail to the person's own address or the admins is never capped", async () => {
  assert.deepEqual(await send(ada, { capped: false }), { sent: true });
});
