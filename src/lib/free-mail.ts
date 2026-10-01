import list from "free-email-domains";
import { bareDomain } from "./sso.ts";

/**
 * Domains that hand out addresses to the public: webmail (gmail.com,
 * gmx.de, proton.me), internet providers (orange.fr, comcast.net) and
 * throwaway inboxes, some 14,000 of them (free-email-domains, MIT). Their
 * staff can prove the domain, and single sign-on there is fine: only staff
 * get through the provider. Joining by domain is not: every customer with an
 * address there would walk into the company's organization.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
const FREE = new Set<string>(list);

export const freeMail = (domain: string) => FREE.has(bareDomain(domain));
