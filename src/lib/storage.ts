import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  // AWS SDK v3 adds a CRC32 checksum to every request by default. Most
  // S3-compatible providers (R2, B2, SeaweedFS, older MinIO) reject it, and it
  // also leaks into presigned URLs and breaks browser PUTs.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const BUCKET = env.S3_BUCKET;

/** Content-addressed key for an original. */
export const originalKey = (sha256: string) => `assets/${sha256}`;

/** Renditions are keyed by content hash, so identical files share them. */
export const renditionKey = (sha256: string, transform: string, ext: string) =>
  `renditions/${sha256}/${transform}.${ext}`;

/** A still derived from a file sharp can't read (lib/core/previews.ts), by the still's own hash. */
export const previewKey = (sha256: string) => `previews/${sha256}`;

/** Temp landing spot for a browser upload, before its hash is known. */
export const stagingKey = (token: string) => `staging/${token}`;

/** Content-Length is signed in: storage refuses a body of any other size than the one claimed. */
export async function presignPut(key: string, contentType: string, contentLength: number, expiresIn = 900) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn },
  );
}

export async function getObject(key: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

/**
 * An object as a stream, for serving without holding it in memory. With a
 * `Range`, part of it: S3 parses the range and says which bytes it sent.
 */
export async function getStream(key: string, range?: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: range }));
  return { body: res.Body!.transformToWebStream(), length: res.ContentLength!, contentRange: res.ContentRange };
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Its size in bytes, or null when there is no such object. */
export async function sizeOf(key: string) {
  try {
    return (await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))).ContentLength ?? 0;
  } catch {
    return null;
  }
}

export const exists = async (key: string) => (await sizeOf(key)) !== null;

/**
 * Uploads abandoned before promotion would sit in staging/ forever, and
 * renditions pile up for every size ever asked for. Both are safe to expire:
 * a staged upload lives minutes, a rendition regenerates on its next request.
 */
const LIFECYCLE = [
  { ID: "artbucket-staging", Filter: { Prefix: "staging/" }, Status: "Enabled" as const, Expiration: { Days: 1 } },
  { ID: "artbucket-renditions", Filter: { Prefix: "renditions/" }, Status: "Enabled" as const, Expiration: { Days: 30 } },
];

/**
 * Create the bucket if it is missing and allow browser PUTs from APP_URL.
 *
 * Direct-to-storage uploads mean the browser talks to S3, so the bucket needs a
 * CORS rule. Some providers only allow that from their console - a failure here
 * is logged and tolerated rather than fatal.
 */
let ensured: Promise<void> | null = null;

export function ensureBucket() {
  ensured ??= (async () => {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET })).catch(() => {});
    }
    try {
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: BUCKET,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [env.APP_URL],
                AllowedMethods: ["PUT", "GET", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    } catch (err) {
      console.warn(
        `[artbucket] Could not set CORS on bucket "${BUCKET}". If browser uploads fail, ` +
          `allow PUT from ${env.APP_URL} in your provider's console.`,
        err instanceof Error ? err.message : err,
      );
    }
    // Setting lifecycle replaces every rule on the bucket, so rules someone
    // already set are left alone.
    try {
      const rules = await s3
        .send(new GetBucketLifecycleConfigurationCommand({ Bucket: BUCKET }))
        .then((r) => r.Rules ?? [], () => []);
      if (!rules.length) {
        await s3.send(
          new PutBucketLifecycleConfigurationCommand({ Bucket: BUCKET, LifecycleConfiguration: { Rules: LIFECYCLE } }),
        );
      }
    } catch (err) {
      console.warn(
        `[artbucket] Could not set lifecycle rules on bucket "${BUCKET}". Expire staging/ after 1 day ` +
          `and renditions/ after 30 in your provider's console, or they grow forever.`,
        err instanceof Error ? err.message : err,
      );
    }
  })();
  return ensured;
}
