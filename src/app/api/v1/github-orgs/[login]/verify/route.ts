import { ok, route } from "@/lib/api";
import { verifyGithub } from "@/lib/core/hub-trust";

/** POST /api/v1/github-orgs/{login}/verify - look for the proof file now; a 422 says what is missing. */
export const POST = route<{ login: string }>("organization.manage", async (_req, { login }, caller) => {
  const g = await verifyGithub(caller, decodeURIComponent(login));
  return g ? ok({ data: g }) : null;
}, "No such GitHub account");
