/**
 * Where /c/{id} sends a request: the same rendition of the asset that stands
 * for it now, `?download` kept. A signature is dropped, since it names the id
 * it was made for. Relative, so it stays on whatever origin was asked.
 *
 * Pure: `pnpm test` runs it under plain Node.
 */
export function followPath(url: string, to: string) {
  const { pathname, searchParams } = new URL(url);
  const rest = pathname.replace(/^\/c\/[^/]*/, "");
  return `/a/${to}${rest}${searchParams.has("download") ? "?download" : ""}`;
}
