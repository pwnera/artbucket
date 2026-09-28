import { type Entry, uniqueNames, zip } from "@/lib/zip";

/**
 * Zip files in the browser and save the archive as `name`: the library's
 * bulk download and a brand page's kits. Two files of one name both go in,
 * the second as "a (2).png".
 */
export function saveZip(files: Entry[], name: string) {
  const names = uniqueNames(files.map((f) => f.name));
  const blob = new Blob([zip(files.map((f, i) => ({ ...f, name: names[i] })))], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
