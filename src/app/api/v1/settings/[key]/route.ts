import { body, ok, route } from "@/lib/api";
import { contextOf, resetSetting, updateSetting } from "@/lib/core/settings";
import { checkLimit } from "@/lib/core/usage";
import { SettingPatch } from "@/lib/schemas";

type P = { key: string };

/** PATCH /api/v1/settings/{key}?context=organization - change it here; a blank secret keeps it. */
export const PATCH = route<P>(null, async (req, { key }, caller) => {
  // Branding is a feature the limits can switch off (lib/limits.ts): refused here, since the setting is generic.
  if (key === "branding") await checkLimit(caller.project.organizationId, "branding");
  return ok({ data: await updateSetting(caller, contextOf(req), key, await body(req, SettingPatch)) });
});

/** DELETE /api/v1/settings/{key}?context=organization - forget it here, so what is above applies. */
export const DELETE = route<P>(null, async (req, { key }, caller) => ok({ data: await resetSetting(caller, contextOf(req), key) }));
