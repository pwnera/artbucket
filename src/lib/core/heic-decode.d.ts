// heic-decode ships no types.
declare module "heic-decode" {
  export default function decode(input: { buffer: Uint8Array }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}
