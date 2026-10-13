/**
 * Signs that a build is phishing or malware rather than a brand's site, read
 * from its files before it goes live (lib/core/sites.ts). A static site has
 * no server of its own to sign anyone in, take a payment or ship software, so
 * a page that asks for a password, a card or a wallet's recovery phrase, or a
 * program to download, is what a phishing kit looks like on a free host.
 *
 * Signs, not verdicts: on an organization the operator reviews
 * (LIMIT_SITE_REVIEW), a build with any is held for a person to decide;
 * elsewhere it goes live and the signs stay on its deployment.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */

export type Sign = { file: string; why: string };

/** What a browser would download and run rather than show. */
const PROGRAM = /\.(exe|msi|dmg|pkg|apk|scr|bat|cmd|ps1|vbs|jar|iso|appimage|deb|rpm)$/i;
const PAGE = /\.html?$/i;
const PASSWORD = /<input\b[^>]*\btype\s*=\s*["']?password\b/i;
const CARD = /\bautocomplete\s*=\s*["']?cc-(number|csc|exp)\b|<input\b[^>]*\bname\s*=\s*["']?(card[-_ ]?number|cc[-_ ]?num(ber)?|cvv2?|cvc)\b/i;
const PHRASE = /\b(seed|recovery|secret|mnemonic)\s+phrase\b/i;
const WALLET = /\bwallet\b/i;

/**
 * Sign-in pages phishing kits copy most, by the words on them. A build whose
 * project holds a brand of that name is that brand's own.
 */
const IMPERSONATED = [
  "Microsoft",
  "Office 365",
  "Outlook",
  "OneDrive",
  "SharePoint",
  "Google",
  "Gmail",
  "Apple ID",
  "iCloud",
  "PayPal",
  "Amazon",
  "Netflix",
  "Facebook",
  "Instagram",
  "WhatsApp",
  "DocuSign",
  "Dropbox",
  "Coinbase",
  "Binance",
  "MetaMask",
  "DHL",
  "FedEx",
  "Artbucket",
];

const text = (html: string) => html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");

/** Whose sign-in page this looks like, unless it is one of the project's own brands. */
function lookalike(html: string, own: string[]) {
  const words = text(html).toLowerCase();
  const mine = own.map((b) => b.toLowerCase());
  return IMPERSONATED.find((b) => new RegExp(`\\b${b.toLowerCase().replace(/ /g, "\\s+")}\\b`).test(words) && !mine.some((m) => m.includes(b.toLowerCase())));
}

/** The signs one file gives, by the name it is served at; `content` is read for pages only. */
export function signsIn(name: string, content: () => string, ownBrands: string[] = []): Sign[] {
  if (PROGRAM.test(name)) return [{ file: name, why: "a program to download and run" }];
  if (!PAGE.test(name)) return [];
  const html = content();
  const out: Sign[] = [];
  if (PASSWORD.test(html)) {
    const like = lookalike(html, ownBrands);
    out.push({ file: name, why: like ? `asks for a password, on a page that looks like ${like}'s` : "asks for a password" });
  }
  if (CARD.test(html)) out.push({ file: name, why: "asks for card details" });
  if (PHRASE.test(text(html)) && WALLET.test(html)) out.push({ file: name, why: "asks for a wallet's recovery phrase" });
  return out;
}

/** Signs as one line each, the first few. */
export const signLines = (signs: Sign[]) => signs.slice(0, 5).map((s) => `${s.file} ${s.why}`).concat(signs.length > 5 ? [`and ${signs.length - 5} more`] : []);
