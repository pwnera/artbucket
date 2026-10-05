import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, emailDomains, ssoProviders } from "@/lib/db/schema";
import { recordAudit } from "@/lib/core/audit";
import { forgetHosts } from "@/lib/core/domains";
import { ssoOffered } from "@/lib/core/sso";
import { PROOF_GRACE_DAYS, reproof, txtAt } from "@/lib/domain-proof";
import { pool } from "@/lib/pool";
import { challengeName } from "@/lib/portal";

/**
 * Proved once is not proved for good: a domain changes hands, and whoever
 * holds its DNS now must be able to claim it. Each run looks again at the TXT
 * records of the verified domains looked at longest ago, custom domains
 * (lib/core/domains.ts) and email domains (lib/core/email-domains.ts) alike.
 * One whose record is gone at every look for PROOF_GRACE_DAYS is unverified:
 * it stops serving, or proving single sign-on and joining; its organization
 * may prove it again with the same record, and anyone else may claim it, as
 * any claim left unproved. Runs with the sweep (lib/core/sweep.ts).
 */

/** Per table and run: with a run every six hours, 400 a day each. */
const PER_RUN = 100;
const by = { actor: "Artbucket" };
const why = { error: `its TXT record was gone for ${PROOF_GRACE_DAYS} days` };

/** How many domains it unverified. */
export async function reprove() {
  const now = new Date();
  let unverified = 0;

  const hosts = await db.select().from(domains).where(isNotNull(domains.verifiedAt)).orderBy(sql`${domains.checkedAt} asc nulls first`).limit(PER_RUN);
  await pool(hosts, 8, async (d) => {
    const r = reproof(await txtAt(challengeName(d.host)), d.token, d.missingSince, now);
    // The same claim, still verified: not one removed, or taken by another, meanwhile.
    const same = and(eq(domains.host, d.host), eq(domains.token, d.token), isNotNull(domains.verifiedAt));
    const set = r.unverify ? { verifiedAt: null, missingSince: null, checkedAt: now } : { missingSince: r.missingSince, checkedAt: now };
    const [done] = await db.update(domains).set(set).where(same).returning({ host: domains.host });
    if (!done || !r.unverify) return;
    unverified++;
    await recordAudit(by, "domain.unverified", d.host, why, { organizationId: d.organizationId, workspaceId: null });
  });
  if (unverified) forgetHosts();

  const mail = await db.select().from(emailDomains).where(isNotNull(emailDomains.verifiedAt)).orderBy(sql`${emailDomains.checkedAt} asc nulls first`).limit(PER_RUN);
  let mailLost = false;
  await pool(mail, 8, async (e) => {
    const r = reproof(await txtAt(challengeName(e.domain)), e.token, e.missingSince, now);
    const same = and(eq(emailDomains.domain, e.domain), eq(emailDomains.token, e.token), isNotNull(emailDomains.verifiedAt));
    if (!r.unverify) {
      await db.update(emailDomains).set({ missingSince: r.missingSince, checkedAt: now }).where(same);
      return;
    }
    // Single sign-on was proved by this record (verifyEmailDomain): it goes with it.
    const done = await db.transaction(async (tx) => {
      const [row] = await tx.update(emailDomains).set({ verifiedAt: null, missingSince: null, checkedAt: now }).where(same).returning();
      if (row) await tx.update(ssoProviders).set({ domainVerified: false }).where(and(eq(ssoProviders.organizationId, e.organizationId), eq(ssoProviders.domain, e.domain)));
      return !!row;
    });
    if (!done) return;
    unverified++;
    mailLost = true;
    await recordAudit(by, "email_domain.unverified", e.domain, why, { organizationId: e.organizationId, workspaceId: null });
  });
  if (mailLost) ssoOffered.forget();

  return unverified;
}
