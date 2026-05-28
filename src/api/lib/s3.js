import {
  S3Client,
  PutObjectCommand,
  PutObjectTaggingCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound
} from '@aws-sdk/client-s3';

// Shared S3 client. The SDK reuses HTTPS connections internally, so a
// module-level singleton keeps us from rebuilding the keep-alive pool on
// every request. Credentials come from the default provider chain (env →
// shared config → IAM role), which is exactly what ECS tasks need.
let s3Client = null;
function getClient() {
  if (s3Client) return s3Client;
  const region = process.env.YTAI_AWS_REGION || 'ap-southeast-2';
  s3Client = new S3Client({ region });
  return s3Client;
}

// True when the deployment is configured for S3. When unset, persisters
// fall back to local disk so a dev can work fully offline.
export function isS3Enabled() {
  return Boolean(process.env.YTAI_S3_BUCKET);
}

function bucketName() {
  return process.env.YTAI_S3_BUCKET || '';
}

// Per-environment key namespace ("prod", "dev", or any custom stage name).
// CDK sets this to the deployed stage; local dev defaults to "dev" so a
// misconfigured laptop can't accidentally drop bytes into prod's keyspace.
function s3Prefix() {
  return process.env.YTAI_S3_PREFIX || 'dev';
}

// Build a full key under the current environment's namespace.
// e.g. buildKey('images/abc.png') -> 'prod/images/abc.png'
export function buildKey(rest) {
  const prefix = s3Prefix();
  const trimmed = rest.replace(/^\/+/, '');
  return prefix ? `${prefix}/${trimmed}` : trimmed;
}

function buildS3Url(key) {
  return `s3://${bucketName()}/${key}`;
}

function parseS3Url(url) {
  if (typeof url !== 'string' || !url.startsWith('s3://')) return null;
  const rest = url.slice('s3://'.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

export async function putObject({ key, bytes, contentType }) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: bytes,
      ContentType: contentType
    })
  );
  return buildS3Url(key);
}

export async function objectExists(s3Url) {
  const parsed = parseS3Url(s3Url);
  if (!parsed) return false;
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    return true;
  } catch (err) {
    if (err instanceof NotFound || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

// Returns { bytes, contentType } or null when the object is missing.
// Used by Eyes/OCR/image-serving paths that need the raw bytes in memory.
export async function getObjectBytes(s3Url) {
  const parsed = parseS3Url(s3Url);
  if (!parsed) return null;
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
    );
    const bytes = Buffer.from(await res.Body.transformToByteArray());
    return { bytes, contentType: res.ContentType || 'application/octet-stream' };
  } catch (err) {
    if (err instanceof NoSuchKey || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

// Mark an S3 object as orphan so the bucket's tag-filtered lifecycle rule
// deletes it on the next sweep (24h-ish). Used by the session/doc/admin
// delete paths: the DB row goes immediately, the underlying bytes follow.
// No-ops for non-S3 URLs (local-dev `file://` paths) and missing objects
// (404 on tag is fine — there's nothing to clean up). Other errors bubble
// so the caller can log them.
export async function markObjectOrphan(s3Url) {
  const parsed = parseS3Url(s3Url);
  if (!parsed) return;
  try {
    await getClient().send(
      new PutObjectTaggingCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
        Tagging: { TagSet: [{ Key: 'lifecycle', Value: 'orphan' }] }
      })
    );
  } catch (err) {
    if (err instanceof NoSuchKey || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return;
    }
    throw err;
  }
}

// Returns { stream, contentType, contentLength } or null when missing.
// Stream is a Node.js Readable so callers can pipe straight into a Fastify
// reply without buffering the whole object in memory.
export async function getObjectStream(s3Url) {
  const parsed = parseS3Url(s3Url);
  if (!parsed) return null;
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
    );
    return {
      stream: res.Body,
      contentType: res.ContentType || 'application/octet-stream',
      contentLength: typeof res.ContentLength === 'number' ? res.ContentLength : null
    };
  } catch (err) {
    if (err instanceof NoSuchKey || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}
