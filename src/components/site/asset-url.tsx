"use client";

import { createContext, useContext } from "react";
import { assetUrl } from "@/lib/asset-url";

/**
 * How this part of the page builds /a/ URLs. The default is the module's,
 * signed by whatever a portal handed the page (lib/asset-url.ts). A site's
 * view carries its own signatures, so SiteProvider passes one built from
 * them: the server's render and the browser's then agree, and one request
 * never signs with another's.
 */
export const AssetUrl = createContext<(id: string, rest?: string) => string>(assetUrl);

/** `useAssetUrl()(id, "/w_480,f_webp")`: where to load an asset from, signed when the page was handed a signature. */
export const useAssetUrl = () => useContext(AssetUrl);
